/**
 * Hivemind service — user-scoped storage for the cross-agent workspace.
 *
 * Every query filters by userId (the service role bypasses RLS), so one
 * account can never read or write another account's Hivemind rows. Access
 * gating (who may use Hivemind at all) lives in lib/hivemindAccess.ts and is
 * enforced by the callers: the /api/hivemind router and the MCP factory.
 */

import { z } from 'zod';

import { supabaseAdmin } from '../supabaseClient';

export const checkpointInputSchema = z.object({
  project: z.string().trim().min(1).max(120),
  agent: z.string().trim().min(1).max(60),
  where_left_off: z.string().trim().min(1).max(4000),
  next_steps: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
});

export const memoryInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  project: z.string().trim().min(1).max(120).optional(),
  agent: z.string().trim().min(1).max(60).optional(),
});

export const milestoneInputSchema = z.object({
  track: z.string().trim().min(1).max(120),
  project: z.string().trim().min(1).max(120),
  highlight: z.string().trim().min(1).max(2000),
  agent: z.string().trim().min(1).max(60).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});

export type CheckpointInput = z.infer<typeof checkpointInputSchema>;
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export type HivemindCheckpoint = {
  id: string;
  project: string;
  agent: string;
  where_left_off: string;
  next_steps: string[];
  updated_at: string;
};

export type HivemindMemory = {
  id: string;
  slug: string;
  project: string | null;
  title: string;
  content: string;
  agent: string | null;
  updated_at: string;
};

export type HivemindMilestone = {
  id: string;
  track: string;
  project: string;
  highlight: string;
  agent: string | null;
  occurred_at: string;
};

const CHECKPOINT_COLUMNS = 'id, project, agent, where_left_off, next_steps, updated_at';
const MEMORY_COLUMNS = 'id, slug, project, title, content, agent, updated_at';
const MILESTONE_COLUMNS = 'id, track, project, highlight, agent, occurred_at';

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'memory';
}

/** Escape LIKE/ILIKE wildcards and PostgREST `or()` separators in user text. */
export function sanitizeSearchTerm(query: string): string {
  return query
    .trim()
    .slice(0, 200)
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .replace(/[,()]/g, ' ');
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`Hivemind ${action} failed: ${error?.message ?? 'unknown error'}`);
}

export async function listCheckpoints(userId: string, limit = 50): Promise<HivemindCheckpoint[]> {
  const { data, error } = await supabaseAdmin
    .from('hivemind_checkpoints')
    .select(CHECKPOINT_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) fail('list checkpoints', error);
  return (data ?? []) as HivemindCheckpoint[];
}

/** One live checkpoint per project: a new update replaces the previous one. */
export async function upsertCheckpoint(userId: string, input: CheckpointInput): Promise<HivemindCheckpoint> {
  const row = {
    user_id: userId,
    project: input.project,
    agent: input.agent,
    where_left_off: input.where_left_off,
    next_steps: input.next_steps ?? [],
  };
  const { data, error } = await supabaseAdmin
    .from('hivemind_checkpoints')
    .upsert(row, { onConflict: 'user_id,project' })
    .select(CHECKPOINT_COLUMNS)
    .single();
  if (error || !data) fail('save checkpoint', error);
  return data as HivemindCheckpoint;
}

export async function deleteCheckpoint(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hivemind_checkpoints')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id');
  if (error) fail('delete checkpoint', error);
  return (data ?? []).length > 0;
}

export async function listMemories(
  userId: string,
  opts: { query?: string; project?: string; limit?: number } = {},
): Promise<HivemindMemory[]> {
  let q = supabaseAdmin
    .from('hivemind_memories')
    .select(MEMORY_COLUMNS)
    .eq('user_id', userId);
  if (opts.project) q = q.eq('project', opts.project);
  const term = opts.query ? sanitizeSearchTerm(opts.query) : '';
  if (term) q = q.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  const { data, error } = await q
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 20, 1), 100));
  if (error) fail('list memories', error);
  return (data ?? []) as HivemindMemory[];
}

/** Same title → same slug → the memory is updated in place, not duplicated. */
export async function upsertMemory(userId: string, input: MemoryInput): Promise<HivemindMemory> {
  const row = {
    user_id: userId,
    slug: slugify(input.title),
    title: input.title,
    content: input.content,
    project: input.project ?? null,
    agent: input.agent ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from('hivemind_memories')
    .upsert(row, { onConflict: 'user_id,slug' })
    .select(MEMORY_COLUMNS)
    .single();
  if (error || !data) fail('save memory', error);
  return data as HivemindMemory;
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hivemind_memories')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id');
  if (error) fail('delete memory', error);
  return (data ?? []).length > 0;
}

export async function listMilestones(userId: string, limit = 50): Promise<HivemindMilestone[]> {
  const { data, error } = await supabaseAdmin
    .from('hivemind_milestones')
    .select(MILESTONE_COLUMNS)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) fail('list milestones', error);
  return (data ?? []) as HivemindMilestone[];
}

export async function addMilestone(userId: string, input: MilestoneInput): Promise<HivemindMilestone> {
  const row = {
    user_id: userId,
    track: input.track,
    project: input.project,
    highlight: input.highlight,
    agent: input.agent ?? null,
    ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
  };
  const { data, error } = await supabaseAdmin
    .from('hivemind_milestones')
    .insert(row)
    .select(MILESTONE_COLUMNS)
    .single();
  if (error || !data) fail('save milestone', error);
  return data as HivemindMilestone;
}

export async function getHivemindOverview(userId: string) {
  const [checkpoints, memories, milestones] = await Promise.all([
    listCheckpoints(userId, 50),
    listMemories(userId, { limit: 10 }),
    listMilestones(userId, 10),
  ]);
  return { checkpoints, memories, milestones };
}
