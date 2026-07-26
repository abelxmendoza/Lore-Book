/**
 * Soft-cleanup noisy self entity_facts (conversational / ephemeral / cluster twins).
 *
 * Dry-run by default. Apply with --apply --user-id <uuid>.
 * Never hard-deletes — losers get status=contradicted.
 *
 * Usage:
 *   cd apps/server && npx tsx src/scripts/cleanupSelfEntityFacts.ts --user-id <uuid>
 *   cd apps/server && npx tsx src/scripts/cleanupSelfEntityFacts.ts --user-id <uuid> --apply
 *   cd apps/server && npx tsx src/scripts/cleanupSelfEntityFacts.ts --synthetic-fixture  # CI-safe sample
 */
import '../config';
import { pathToFileURL } from 'url';
import { supabaseAdmin } from '../services/supabaseClient';
import { gateEntityFactWrite } from '../services/entities/entityFactWriteGate';
import {
  classifyFactRelation,
  employmentOrProjectClusterKey,
  normalizeFactText,
} from '../services/entities/entityFactDedup';

export type CleanupAction =
  | 'keep'
  | 'contradict-as-conversational'
  | 'contradict-as-ephemeral'
  | 'contradict-as-noise'
  | 'contradict-as-subject'
  | 'cluster-into-canonical'
  | 'flag-sensitive';

export type CleanupRow = {
  id: string;
  fact: string;
  category: string;
  status: string;
  confidence: number;
  mention_count: number;
  metadata: Record<string, unknown> | null;
  action: CleanupAction;
  reason: string;
  winnerId?: string;
};

type FactRow = {
  id: string;
  fact: string;
  category: string;
  status: string;
  confidence: number;
  mention_count: number;
  last_confirmed_at: string | null;
  metadata: Record<string, unknown> | null;
};

export function classifySelfFactForCleanup(row: FactRow): CleanupRow {
  const gated = gateEntityFactWrite(
    { fact: row.fact, category: row.category, confidence: row.confidence },
    { path: 'self' },
  );
  if (gated.action === 'drop') {
    const action: CleanupAction =
      gated.kind === 'conversational'
        ? 'contradict-as-conversational'
        : gated.kind === 'ephemeral'
          ? 'contradict-as-ephemeral'
          : gated.kind === 'subject'
            ? 'contradict-as-subject'
            : 'contradict-as-noise';
    return { ...row, action, reason: gated.reason };
  }

  if (gated.assertionType === 'feeling' || gated.assertionType === 'uncertain') {
    return { ...row, action: 'flag-sensitive', reason: `assertion:${gated.assertionType}` };
  }

  return { ...row, action: 'keep', reason: gated.reason };
}

/** Mark cluster losers as cluster-into-canonical (prefer highest mention + confidence). */
export function markClusterLosers(rows: CleanupRow[]): CleanupRow[] {
  const byCluster = new Map<string, CleanupRow[]>();
  for (const row of rows) {
    if (row.action !== 'keep' && row.action !== 'flag-sensitive') continue;
    const key = employmentOrProjectClusterKey(normalizeFactText(row.fact));
    if (!key) continue;
    const list = byCluster.get(key) ?? [];
    list.push(row);
    byCluster.set(key, list);
  }

  const out = [...rows];
  for (const [, group] of byCluster) {
    if (group.length < 2) continue;
    const winner = group.reduce((a, b) => {
      const score = (r: CleanupRow) =>
        (r.mention_count ?? 1) * 10 + (r.confidence ?? 0) * 5 + r.fact.length * 0.01;
      return score(a) >= score(b) ? a : b;
    });
    for (const loser of group) {
      if (loser.id === winner.id) continue;
      const relation = classifyFactRelation(winner.fact, loser.fact);
      if (relation === 'distinct') continue;
      const idx = out.findIndex((r) => r.id === loser.id);
      if (idx < 0) continue;
      out[idx] = {
        ...out[idx]!,
        action: 'cluster-into-canonical',
        reason: `cluster_loser_of:${winner.id}`,
        winnerId: winner.id,
      };
    }
  }
  return out;
}

export function syntheticCleanupFixture(): FactRow[] {
  return [
    {
      id: 'f1',
      fact: 'Is asking whether Lore remembers their story',
      category: 'general',
      status: 'active',
      confidence: 0.9,
      mention_count: 3,
      last_confirmed_at: null,
      metadata: null,
    },
    {
      id: 'f2',
      fact: 'Is on their second day at Vanguard Robotics',
      category: 'career',
      status: 'active',
      confidence: 0.8,
      mention_count: 1,
      last_confirmed_at: null,
      metadata: null,
    },
    {
      id: 'f3',
      fact: 'Works at Vanguard Robotics as a QA technician',
      category: 'career',
      status: 'active',
      confidence: 0.95,
      mention_count: 4,
      last_confirmed_at: null,
      metadata: { evidence_ids: ['m1', 'm2'] },
    },
    {
      id: 'f4',
      fact: 'Is currently working at Vanguard',
      category: 'career',
      status: 'active',
      confidence: 0.7,
      mention_count: 1,
      last_confirmed_at: null,
      metadata: null,
    },
    {
      id: 'f5',
      fact: 'Marcus is a DJ for Northwind Labs',
      category: 'career',
      status: 'active',
      confidence: 0.8,
      mention_count: 1,
      last_confirmed_at: null,
      metadata: null,
    },
  ];
}

async function loadSelfCharacterId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .eq('importance_level', 'protagonist')
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;

  const { data: meta } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .limit(50);
  const self = (meta ?? []).find((c) => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.is_self === true || m.self === true;
  });
  return self?.id ?? null;
}

async function loadSelfFacts(userId: string, characterId: string): Promise<FactRow[]> {
  const { data, error } = await supabaseAdmin
    .from('entity_facts')
    .select('id, fact, category, status, confidence, mention_count, last_confirmed_at, metadata')
    .eq('user_id', userId)
    .eq('entity_id', characterId)
    .eq('entity_type', 'character')
    .in('status', ['active', 'updated', 'corrected']);
  if (error) throw error;
  return (data ?? []) as FactRow[];
}

async function applyCleanup(userId: string, rows: CleanupRow[]): Promise<number> {
  let updated = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    if (
      row.action !== 'contradict-as-conversational' &&
      row.action !== 'contradict-as-ephemeral' &&
      row.action !== 'contradict-as-noise' &&
      row.action !== 'contradict-as-subject' &&
      row.action !== 'cluster-into-canonical'
    ) {
      continue;
    }

    if (row.action === 'cluster-into-canonical' && row.winnerId) {
      const winner = rows.find((r) => r.id === row.winnerId);
      if (winner) {
        const prevMeta =
          winner.metadata && typeof winner.metadata === 'object' ? { ...winner.metadata } : {};
        const evidence = Array.isArray(prevMeta.evidence_ids)
          ? [...(prevMeta.evidence_ids as string[])]
          : [];
        const loserEvidence =
          row.metadata && Array.isArray(row.metadata.evidence_ids)
            ? (row.metadata.evidence_ids as string[])
            : [];
        for (const id of loserEvidence) {
          if (!evidence.includes(id)) evidence.push(id);
        }
        await supabaseAdmin
          .from('entity_facts')
          .update({
            mention_count: (winner.mention_count ?? 1) + (row.mention_count ?? 1),
            metadata: {
              ...prevMeta,
              evidence_ids: evidence.slice(-40),
              confirmation_count: Math.max(evidence.length, 1),
              cleanup_merged_from: [
                ...((Array.isArray(prevMeta.cleanup_merged_from)
                  ? prevMeta.cleanup_merged_from
                  : []) as string[]),
                row.id,
              ].slice(-20),
            },
            updated_at: now,
          })
          .eq('id', winner.id)
          .eq('user_id', userId);
      }
    }

    const { error } = await supabaseAdmin
      .from('entity_facts')
      .update({
        status: 'contradicted',
        updated_at: now,
        metadata: {
          ...(row.metadata ?? {}),
          cleanup_reason: row.reason,
          cleanup_action: row.action,
          cleanup_at: now,
        },
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (!error) updated += 1;
  }
  return updated;
}

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const synthetic = argv.includes('--synthetic-fixture');
  const idx = argv.indexOf('--user-id');
  const userId = idx >= 0 ? argv[idx + 1] : undefined;
  return { apply, synthetic, userId };
}

export async function runCleanupSelfEntityFacts(argv = process.argv.slice(2)): Promise<void> {
  const { apply, synthetic, userId } = parseArgs(argv);

  if (synthetic) {
    const classified = markClusterLosers(
      syntheticCleanupFixture().map(classifySelfFactForCleanup),
    );
    const summary = classified.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({ mode: 'synthetic', summary, rows: classified }, null, 2));
    return;
  }

  if (!userId) {
    console.error('Provide --user-id <uuid> or --synthetic-fixture');
    process.exitCode = 1;
    return;
  }

  const characterId = await loadSelfCharacterId(userId);
  if (!characterId) {
    console.error('No self/protagonist character found for user');
    process.exitCode = 1;
    return;
  }

  const facts = await loadSelfFacts(userId, characterId);
  const classified = markClusterLosers(facts.map(classifySelfFactForCleanup));
  const summary = classified.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        userId,
        characterId,
        total: classified.length,
        summary,
        sample: classified.filter((r) => r.action !== 'keep').slice(0, 40),
      },
      null,
      2,
    ),
  );

  if (apply) {
    const updated = await applyCleanup(userId, classified);
    console.log(JSON.stringify({ applied: updated }));
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runCleanupSelfEntityFacts().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
