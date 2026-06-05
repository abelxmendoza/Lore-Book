/**
 * Relationship Foundation Service — Sprint D
 *
 * Character A + Character B → Relationship Record
 *
 * Two detection strategies (both rule-based, no LLM):
 *
 *   1. Co-mention: characters who appear in the same journal entry share a
 *      relationship. Source of truth: character_memories join.
 *
 *   2. Protagonist linkage: the protagonist (highest-mention character) has
 *      a relationship with every other character in the user's memories,
 *      even if they never share the same entry. This handles cases where
 *      distilled content says "User went to Costco with Abuela" — the
 *      protagonist "Abel Mendoza" never appears in the same entry as
 *      "Abuela" by name, but the relationship is real.
 *
 * Relationship type is inferred from vocabulary patterns in entry content.
 * No LLM. No scoring. No sentiment. Facts only.
 *
 * Deduplication key: (user_id, char_a_id, char_b_id) where char_a < char_b
 * (UUID lexicographic order) — ensures each pair has exactly one record.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

export type FoundationRelType =
  | 'romantic'
  | 'family'
  | 'friend'
  | 'acquaintance'
  | 'coworker'
  | 'teammate'
  | 'mentor'
  | 'unknown';

// ── Relationship type vocabulary patterns ─────────────────────────────────────
// Applied against the concatenated content of all shared/relevant journal entries.
// First pattern that matches wins.

const TYPE_PATTERNS: [FoundationRelType, RegExp][] = [
  ['romantic', /\b(romantic|dating|girlfriend|boyfriend|blocked|no contact|broke up|breakup|left.*on read|intimate|relationship with a girl|relationship with a guy|sexual|dumped|ex\b)\b/i],
  ['family',   /\b(abuela|grandmoth|grandma|grandfather|grandpa|mother|father|mom\b|dad\b|sibling|sister|brother|family|parent|uncle|aunt|cousin|relative|nephew|niece|in-law)\b/i],
  ['mentor',   /\b(mentor|coach|teacher|professor|instructor|guide|tutor)\b/i],
  ['coworker', /\b(coworker|colleague|work(s)?\s+(with|together)|office|manager|boss|supervisor|employee|intern)\b/i],
  ['teammate', /\b(teammate|team\s*mate|on\s+the\s+team|squad|training\s+partner)\b/i],
  ['friend',   /\b(friend|buddy|pal|bestie|homie|hang\s*out|kick\s+it|grew\s+up\s+with)\b/i],
  ['acquaintance', /\b(met|acquaintance|know\s+of|ran\s+into|bumped\s+into)\b/i],
];

function inferRelationshipType(content: string): FoundationRelType {
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(content)) return type;
  }
  return 'unknown';
}

// Normalize pair ordering so (A,B) and (B,A) produce the same key.
function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

type RelationshipRow = {
  id: string;
  user_id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  status: string;
  metadata: Record<string, unknown>;
};

class RelationshipFoundationService {
  /**
   * Main pipeline: extract all relationships for a user.
   * Runs both co-mention and protagonist-linkage strategies.
   */
  async extractRelationshipsFromMemories(userId: string): Promise<{
    created: number;
    updated: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, pairs: 0 };

    // ── Load all characters + their linked entries ────────────────────────────
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);

    if (!chars?.length) {
      logger.info({ userId }, 'No characters found — skipping relationship extraction');
      return stats;
    }

    // Build map: characterId → { name, entryIds }
    const charMap = new Map<string, { name: string; entryIds: string[] }>();
    for (const c of chars) {
      const entryIds: string[] = (c.metadata as any)?.source_entry_ids ?? [];
      charMap.set(c.id, { name: c.name, entryIds });
    }

    // ── Identify protagonist (highest mention_count) ──────────────────────────
    let protagonist: { id: string; name: string; entryIds: string[] } | null = null;
    let maxMentions = -1;
    for (const c of chars) {
      const count = (c.metadata as any)?.mention_count ?? 0;
      if (count > maxMentions) {
        maxMentions = count;
        protagonist = { id: c.id, name: c.name, entryIds: charMap.get(c.id)!.entryIds };
      }
    }

    // ── Strategy 1: Co-mention pairs ─────────────────────────────────────────
    // Find all (charA, charB) pairs that share at least one journal entry.
    // Build per-entry → [characters] index from character_memories
    const { data: memLinks } = await supabaseAdmin
      .from('character_memories')
      .select('character_id, journal_entry_id')
      .eq('user_id', userId);

    const entryToChars = new Map<string, Set<string>>();
    for (const link of memLinks ?? []) {
      if (!entryToChars.has(link.journal_entry_id)) {
        entryToChars.set(link.journal_entry_id, new Set());
      }
      entryToChars.get(link.journal_entry_id)!.add(link.character_id);
    }

    // Aggregate shared entries per pair
    const pairSharedEntries = new Map<string, Set<string>>();
    for (const [entryId, charSet] of entryToChars) {
      const charList = Array.from(charSet);
      for (let i = 0; i < charList.length; i++) {
        for (let j = i + 1; j < charList.length; j++) {
          const [a, b] = normalizePair(charList[i], charList[j]);
          const key = `${a}::${b}`;
          if (!pairSharedEntries.has(key)) pairSharedEntries.set(key, new Set());
          pairSharedEntries.get(key)!.add(entryId);
        }
      }
    }

    // ── Strategy 2: Protagonist linkage ──────────────────────────────────────
    // Every non-protagonist character has a relationship with the protagonist.
    if (protagonist) {
      const otherChars = chars.filter(c => c.id !== protagonist!.id);
      for (const other of otherChars) {
        const [a, b] = normalizePair(protagonist.id, other.id);
        const key = `${a}::${b}`;
        if (!pairSharedEntries.has(key)) {
          // No co-mention found — link using the other character's own entries
          const otherEntryIds = charMap.get(other.id)?.entryIds ?? [];
          pairSharedEntries.set(key, new Set(otherEntryIds));
        }
      }
    }

    // ── For each pair, fetch entry content and upsert relationship ───────────
    for (const [pairKey, sharedEntrySet] of pairSharedEntries) {
      const [charAId, charBId] = pairKey.split('::');
      const sharedEntryIds = Array.from(sharedEntrySet);

      stats.pairs++;

      // Fetch content of all shared entries for type inference
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, mood, tags')
        .in('id', sharedEntryIds)
        .limit(10);

      const combinedContent = (entries ?? [])
        .map(e => [e.content, (e.tags ?? []).join(' ')].join(' '))
        .join('\n');

      const relType = inferRelationshipType(combinedContent);

      const isNew = await this.upsertRelationship(userId, {
        charAId,
        charBId,
        relType,
        entryIds: sharedEntryIds,
      });

      if (isNew) stats.created++;
      else stats.updated++;
    }

    return stats;
  }

  private async upsertRelationship(
    userId: string,
    params: {
      charAId: string;
      charBId: string;
      relType: FoundationRelType;
      entryIds: string[];
    }
  ): Promise<boolean> {
    const [srcId, tgtId] = normalizePair(params.charAId, params.charBId);

    // Check for existing relationship in either direction
    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id, metadata')
      .eq('user_id', userId)
      .or(`and(source_character_id.eq.${srcId},target_character_id.eq.${tgtId}),and(source_character_id.eq.${tgtId},target_character_id.eq.${srcId})`)
      .limit(1);

    if (existing?.[0]) {
      // Update existing: merge in any new source_memory_ids
      const existingIds = new Set<string>((existing[0].metadata as any)?.source_memory_ids ?? []);
      params.entryIds.forEach(id => existingIds.add(id));

      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: params.relType,
          metadata: {
            ...((existing[0].metadata as Record<string, unknown>) ?? {}),
            source_memory_ids: Array.from(existingIds),
            co_mention_count: existingIds.size,
            last_refreshed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);

      return false; // updated, not new
    }

    // Create new relationship
    const row: RelationshipRow = {
      id: uuid(),
      user_id: userId,
      source_character_id: srcId,
      target_character_id: tgtId,
      relationship_type: params.relType,
      status: 'active',
      metadata: {
        source_memory_ids: params.entryIds,
        co_mention_count: params.entryIds.length,
        generated_by: 'relationship_foundation',
        generated_at: new Date().toISOString(),
      },
    };

    const { error } = await supabaseAdmin
      .from('character_relationships')
      .insert(row);

    if (error) {
      logger.error({ error, srcId, tgtId }, 'Failed to insert relationship');
      return false;
    }

    return true; // created
  }

  /**
   * List all relationships for a user with character names resolved.
   */
  async listRelationshipsWithNames(userId: string): Promise<Array<{
    id: string;
    characterA: string;
    characterB: string;
    type: string;
    status: string;
    memoryCount: number;
    memoryIds: string[];
  }>> {
    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, status, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!rels?.length) return [];

    // Resolve character names
    const charIds = [...new Set(rels.flatMap(r => [r.source_character_id, r.target_character_id]))];
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .in('id', charIds);

    const nameMap = new Map((chars ?? []).map(c => [c.id, c.name]));

    return rels.map(r => ({
      id: r.id,
      characterA: nameMap.get(r.source_character_id) ?? r.source_character_id,
      characterB: nameMap.get(r.target_character_id) ?? r.target_character_id,
      type: r.relationship_type,
      status: r.status,
      memoryCount: (r.metadata as any)?.co_mention_count ?? 0,
      memoryIds: (r.metadata as any)?.source_memory_ids ?? [],
    }));
  }
}

export const relationshipFoundationService = new RelationshipFoundationService();
