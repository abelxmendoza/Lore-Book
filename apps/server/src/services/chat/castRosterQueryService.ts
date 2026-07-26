/**
 * Current-story cast query — closed-scope classification of who's new vs.
 * returning in the ACTIVE conversation thread only, never the whole
 * autobiography. Reuses threadRosterService (thread cast) and
 * entity_conversation_links (cross-session first-mention) rather than
 * deriving either from scratch.
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveMention, type ResolutionCandidate } from '../entities/entityResolutionCore';
import { characterToResolutionCandidate } from '../entities/entityResolutionBridge';
import type { ModeHandlerResponse } from '../modeRouter/modeHandlers';

export type CastMemberClassification = 'returning' | 'new' | 'unresolved';

export type CastMemberResult = {
  name: string;
  entityId: string | null;
  classification: CastMemberClassification;
  confidence: number;
  reason: string;
  spellingNote?: string;
};

function isBefore(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() < new Date(b).getTime();
}

/**
 * Classify the cast of the active story window (this chat session only).
 * Evidence priority: (1) active-story roster derivation, (2) resolveMention
 * against the existing Character Book for name-only mentions, (3) aliases /
 * cross-session first-mention via entity_conversation_links. No general
 * re-search — unresolved names simply stay unresolved.
 */
export async function classifyCastForActiveStory(
  userId: string,
  sessionId: string
): Promise<{ members: CastMemberResult[]; storyWindowStart: string | null }> {
  const { loadThreadMessages } = await import('../conversationCentered/threadContentService');
  const { threadRosterService } = await import('../conversationCentered/threadRosterService');

  const [messages, roster] = await Promise.all([
    loadThreadMessages(userId, sessionId),
    threadRosterService.getRoster(userId, sessionId),
  ]);

  const storyWindowStart = messages[0]?.created_at ?? null;
  const entries = (roster?.entries ?? []).filter((e) => e.status === 'active');

  if (entries.length === 0) {
    return { members: [], storyWindowStart };
  }

  const linkedIds = entries.filter((e) => e.entityId).map((e) => e.entityId as string);

  // entity_conversation_links.first_linked_at, minimized across ALL sessions —
  // the authoritative "first thread that introduced this entity" signal.
  const firstLinkedAtByEntity = new Map<string, string>();
  if (linkedIds.length > 0) {
    const { data: linkRows } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_id, first_linked_at')
      .eq('user_id', userId)
      .in('entity_id', linkedIds);
    for (const row of linkRows ?? []) {
      const entityId = row.entity_id as string;
      const firstLinkedAt = row.first_linked_at as string;
      const existing = firstLinkedAtByEntity.get(entityId);
      if (!existing || isBefore(firstLinkedAt, existing)) {
        firstLinkedAtByEntity.set(entityId, firstLinkedAt);
      }
    }
  }

  // Candidate pool for name-only mentions — the user's existing Character Book.
  let candidatePool: ResolutionCandidate[] = [];
  if (entries.some((e) => !e.entityId)) {
    const { data: characterRows } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    candidatePool = (characterRows ?? []).map((row: any) =>
      characterToResolutionCandidate({
        id: row.id,
        name: row.name,
        alias: row.alias,
        metadata: row.metadata,
      })
    );
  }

  const members: CastMemberResult[] = [];

  for (const entry of entries) {
    if (entry.entityId) {
      const firstLinkedAt = firstLinkedAtByEntity.get(entry.entityId);
      const returning = isBefore(firstLinkedAt, storyWindowStart);
      members.push({
        name: entry.name,
        entityId: entry.entityId,
        classification: returning ? 'returning' : 'new',
        confidence: 0.9,
        reason: returning
          ? 'First appeared in an earlier thread — Character Book record predates this story.'
          : 'First appearance is inside this story window.',
      });
      continue;
    }

    // Roster-level low-confidence signal: a name kept on the cast only as a
    // recurring ANONYMOUS_PERSON means the roster pipeline itself never
    // cleanly resolved this identity — the closest available "spelling
    // uncertain" signal, since name-plausibility can't be judged from the
    // bare string alone (both "Wrenlow" and "xyz" classify identically
    // UNKNOWN/low-confidence with no surrounding context).
    if (entry.actorType === 'ANONYMOUS_PERSON') {
      members.push({
        name: entry.name,
        entityId: null,
        classification: 'unresolved',
        confidence: 0.2,
        reason: 'Recurring but never cleanly resolved to a single identity in this thread.',
        spellingNote: `${entry.name} — new, spelling uncertain`,
      });
      continue;
    }

    // Name-only mention: resolve against the existing Character Book
    // (covers alias/direct-link evidence via resolveMention's lexical match).
    // 'PERSON' hint matches characterRegistry's own resolveMention call —
    // every roster entry here already passed the roster's cast-quality gate
    // (mayAppearOnCast), so it's already known to be a person-like mention;
    // without the hint, an unfamiliar bare name classifies UNKNOWN and
    // resolveMention abstains with action 'skip' instead of 'create'.
    const result = resolveMention(entry.name, candidatePool, { threadEntityIds: linkedIds }, 'PERSON');

    if (result.action === 'resolve' && result.confidence >= 0.7 && result.resolvedId) {
      const firstLinkedAt = firstLinkedAtByEntity.get(result.resolvedId);
      const returning = !firstLinkedAt || isBefore(firstLinkedAt, storyWindowStart);
      members.push({
        name: entry.name,
        entityId: result.resolvedId,
        classification: returning ? 'returning' : 'new',
        confidence: result.confidence,
        reason: returning
          ? 'Resolved to an existing Character Book record predating this story.'
          : 'Resolved to a Character Book record created during this story.',
      });
    } else if (result.action === 'create') {
      members.push({
        name: entry.name,
        entityId: null,
        classification: 'new',
        confidence: result.confidence,
        reason: 'No existing Character Book match — first appearance in this story.',
      });
    } else {
      // 'disambiguate', or low name/type confidence — do not guess.
      members.push({
        name: entry.name,
        entityId: null,
        classification: 'unresolved',
        confidence: result.confidence,
        reason: 'Name could not be confidently matched or classified.',
        spellingNote: `${entry.name} — new, spelling uncertain`,
      });
    }
  }

  return { members, storyWindowStart };
}

function formatCastResponse(members: CastMemberResult[]): string {
  if (members.length === 0) {
    return "I don't see anyone specific mentioned yet in this conversation — who would you like me to track?";
  }
  const returning = members.filter((m) => m.classification === 'returning');
  const fresh = members.filter((m) => m.classification === 'new');
  const unresolved = members.filter((m) => m.classification === 'unresolved');

  const lines: string[] = [];
  if (returning.length > 0) {
    lines.push(`**Returning:** ${returning.map((m) => m.name).join(', ')}`);
  }
  if (fresh.length > 0) {
    lines.push(`**New:** ${fresh.map((m) => m.name).join(', ')}`);
  }
  if (unresolved.length > 0) {
    lines.push(`**Unresolved:** ${unresolved.map((m) => m.spellingNote ?? `${m.name} — spelling uncertain`).join(', ')}`);
  }
  return lines.join('\n');
}

export async function buildCastRosterChatResponse(
  userId: string,
  _message: string,
  threadId: string
): Promise<ModeHandlerResponse> {
  const { members, storyWindowStart } = await classifyCastForActiveStory(userId, threadId);
  return {
    content: formatCastResponse(members),
    response_mode: 'CURRENT_STORY_CAST',
    confidence: 0.9,
    metadata: { cast: members, story_window_start: storyWindowStart },
  };
}
