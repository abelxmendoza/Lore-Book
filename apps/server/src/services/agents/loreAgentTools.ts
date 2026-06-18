/**
 * LORE AGENT TOOLS
 *
 * The only sanctioned interface between agents and the rest of LoreBook.
 * Agents must use these tools rather than importing services or touching the
 * database directly.
 *
 * Safety contract for v1:
 *   - Every read tool is best-effort and degrades to an empty result.
 *   - The single write-shaped tool (`proposeMemoryMutation`) writes ONLY to
 *     `lore_agent_proposed_actions`. It records a proposal for later
 *     confirmation; it does NOT mutate memory, entities, or identity.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  LoreAgentTools,
  MemorySearchHit,
  EntityGraphNode,
  PipelineTrace,
  ProposeMemoryMutationArgs,
} from './loreAgentTypes';

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);
function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code != null && MISSING_TABLE_CODES.has(code);
}

async function searchMemories(userId: string, query: string): Promise<MemorySearchHit[]> {
  if (!query.trim()) return [];
  try {
    // Lightweight keyword read over the canonical claims surface.
    // Semantic recall is intentionally deferred to a later PR.
    const { data, error } = await supabaseAdmin
      .from('omega_memory')
      .select('id, content')
      .eq('user_id', userId)
      .ilike('content', `%${query.slice(0, 80)}%`)
      .limit(5);

    if (error) {
      if (!isMissingTable(error)) logger.debug({ err: error }, 'loreAgentTools.searchMemories failed');
      return [];
    }
    return (data ?? []).map((row: { id: string; content: string }) => ({
      id: row.id,
      text: row.content,
      score: 0.5,
      source: 'omega_memory',
    }));
  } catch (err) {
    logger.debug({ err }, 'loreAgentTools.searchMemories threw');
    return [];
  }
}

async function getEntityGraph(userId: string): Promise<EntityGraphNode[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('entities')
      .select('id, name, type')
      .eq('user_id', userId)
      .limit(100);
    if (error) {
      if (!isMissingTable(error)) logger.debug({ err: error }, 'loreAgentTools.getEntityGraph failed');
      return [];
    }
    return (data ?? []).map((row: { id: string; name: string; type?: string }) => ({
      id: row.id,
      name: row.name,
      kind: row.type ?? 'unknown',
    }));
  } catch (err) {
    logger.debug({ err }, 'loreAgentTools.getEntityGraph threw');
    return [];
  }
}

async function getRecentThreadContext(threadId: string): Promise<Array<{ role: string; content: string }>> {
  if (!threadId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) {
      if (!isMissingTable(error)) logger.debug({ err: error }, 'loreAgentTools.getRecentThreadContext failed');
      return [];
    }
    return (data ?? []).reverse().map((row: { role: string; content: string }) => ({
      role: row.role,
      content: row.content,
    }));
  } catch (err) {
    logger.debug({ err }, 'loreAgentTools.getRecentThreadContext threw');
    return [];
  }
}

async function getPipelineTrace(userId: string, messageId: string): Promise<PipelineTrace | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('metadata')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) {
      if (error && !isMissingTable(error)) logger.debug({ err: error }, 'loreAgentTools.getPipelineTrace failed');
      return null;
    }
    const metadata = (data.metadata as Record<string, unknown>) ?? {};
    const interp = (metadata.interpretation_pipeline as Record<string, unknown>) ?? {};
    return {
      messageId,
      phases: (interp.phases as string[]) ?? [],
      lexicalConfidence: interp.lexical_confidence as number | undefined,
      meaningConfidence: interp.meaning_confidence as number | undefined,
      factuality: interp.factuality as string | undefined,
      raw: interp,
    };
  } catch (err) {
    logger.debug({ err }, 'loreAgentTools.getPipelineTrace threw');
    return null;
  }
}

async function getSystemKnowledge(concept?: string): Promise<Array<Record<string, unknown>>> {
  try {
    let query = supabaseAdmin.from('system_knowledge').select('*');
    if (concept) query = query.ilike('concept', `%${concept}%`);
    const { data, error } = await query.limit(50);
    if (error) {
      if (!isMissingTable(error)) logger.debug({ err: error }, 'loreAgentTools.getSystemKnowledge failed');
      return [];
    }
    return data ?? [];
  } catch (err) {
    logger.debug({ err }, 'loreAgentTools.getSystemKnowledge threw');
    return [];
  }
}

/**
 * Record a proposed memory mutation for later confirmation.
 *
 * IMPORTANT: this writes ONLY to lore_agent_proposed_actions. It is the
 * agent layer's way of saying "I think this should be remembered" — the
 * actual write is performed later by the user (via Memory Review Queue) or by
 * a sanctioned service routed through Correction Authority.
 */
async function proposeMemoryMutation(args: ProposeMemoryMutationArgs): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('lore_agent_proposed_actions').insert({
      user_id: args.userId,
      run_id: args.runId,
      agent_name: args.agentName,
      action_type: 'propose_memory_mutation',
      status: 'proposed',
      target_kind: args.category,
      payload: { claim: args.claim, category: args.category, provenance: args.provenance },
      confidence: args.confidence,
      requires_confirmation: true,
      routed_to: args.routeTo,
    });
    if (error && !isMissingTable(error)) {
      logger.warn({ err: error, agent: args.agentName }, 'loreAgentTools.proposeMemoryMutation insert failed');
    }
  } catch (err) {
    logger.warn({ err, agent: args.agentName }, 'loreAgentTools.proposeMemoryMutation threw (non-fatal)');
  }
}

export const loreAgentTools: LoreAgentTools = {
  searchMemories,
  getEntityGraph,
  getRecentThreadContext,
  getPipelineTrace,
  getSystemKnowledge,
  proposeMemoryMutation,
};
