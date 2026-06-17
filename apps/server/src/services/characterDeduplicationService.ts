/**
 * Character deduplication — cross-store duplicate detection with title-aware
 * matching, alias synonyms, Jaro-Winkler, and relationship/event overlap.
 */

import { logger } from '../logger';
import { matchCharacterName, buildMatchKeys, parseCharacterName } from '../utils/characterNameMatching';
import { normalizeNameKey } from '../utils/nameNormalization';
import { jaroWinkler } from '../utils/jaroWinkler';

import { characterMergeService } from './characterMergeService';
import { supabaseAdmin } from './supabaseClient';

export interface CharacterRecord {
  id: string;
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export type DuplicateCandidate = {
  characterId: string;
  name: string;
  confidence: number;
  method: string;
  reason?: string;
};

export type DuplicateGroup = {
  canonicalId: string;
  canonicalName: string;
  duplicateIds: string[];
  members: Array<{ id: string; name: string; confidence: number }>;
  avgConfidence: number;
};

export type DeduplicationOverlap = {
  sharedRelationships: number;
  sharedEpisodes: number;
  sharedEvents: number;
};

const DEDUP_THRESHOLD = 0.85;

function normalizeName(name: string): string {
  return normalizeNameKey(name)
    .replace(/^(my|her|his|their|our|the)\s+/i, '')
    .replace(/'s\s.*$/, '')
    .trim();
}

/** @deprecated Use characterAuthorityService — kept for backward compatibility. */
export function findSimilarCharacter(
  name: string,
  existingCharacters: CharacterRecord[]
): CharacterRecord | null {
  const candidates = characterDeduplicationService.findCandidates(name, existingCharacters);
  return candidates.length > 0
    ? existingCharacters.find(c => c.id === candidates[0].characterId) ?? null
    : null;
}

class CharacterDeduplicationService {
  findCandidates(name: string, existingCharacters: CharacterRecord[]): DuplicateCandidate[] {
    if (!name?.trim() || existingCharacters.length === 0) return [];

    const results: DuplicateCandidate[] = [];
    for (const char of existingCharacters) {
      const direct = matchCharacterName(name, char.name);
      if (direct.matches) {
        results.push({
          characterId: char.id,
          name: char.name,
          confidence: direct.confidence,
          method: direct.method,
          reason: direct.reason,
        });
        continue;
      }
      for (const alias of char.alias ?? []) {
        const aliasMatch = matchCharacterName(name, alias);
        if (aliasMatch.matches) {
          results.push({
            characterId: char.id,
            name: char.name,
            confidence: aliasMatch.confidence,
            method: 'alias',
            reason: alias,
          });
          break;
        }
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  scorePair(a: CharacterRecord, b: CharacterRecord): { confidence: number; method: string } {
    const direct = matchCharacterName(a.name, b.name);
    if (direct.matches) return { confidence: direct.confidence, method: direct.method };

    for (const alias of [...(a.alias ?? []), ...(b.alias ?? [])]) {
      const m = matchCharacterName(a.name, alias) ;
      if (m.matches) return { confidence: m.confidence, method: 'alias' };
    }

    const keysA = buildMatchKeys(a.name, a.alias ?? []);
    const keysB = buildMatchKeys(b.name, b.alias ?? []);
    for (const ka of keysA) {
      for (const kb of keysB) {
        if (ka === kb) return { confidence: 0.9, method: 'match_key' };
        if (ka.length >= 3 && kb.length >= 3 && jaroWinkler(ka, kb) >= DEDUP_THRESHOLD) {
          return { confidence: jaroWinkler(ka, kb), method: 'fuzzy_key' };
        }
      }
    }

    return { confidence: 0, method: 'none' };
  }

  async computeOverlap(userId: string, idA: string, idB: string): Promise<DeduplicationOverlap> {
    const [relsA, relsB, episodesA, episodesB, eventsA, eventsB] = await Promise.all([
      this.relationshipPartnerSet(userId, idA),
      this.relationshipPartnerSet(userId, idB),
      this.episodeIdSet(userId, idA),
      this.episodeIdSet(userId, idB),
      this.eventIdSet(userId, idA),
      this.eventIdSet(userId, idB),
    ]);

    return {
      sharedRelationships: this.intersectionSize(relsA, relsB),
      sharedEpisodes: this.intersectionSize(episodesA, episodesB),
      sharedEvents: this.intersectionSize(eventsA, eventsB),
    };
  }

  private intersectionSize(a: Set<string>, b: Set<string>): number {
    let count = 0;
    for (const x of a) if (b.has(x)) count++;
    return count;
  }

  private async relationshipPartnerSet(userId: string, characterId: string): Promise<Set<string>> {
    const { data } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);
    const partners = new Set<string>();
    for (const row of data ?? []) {
      const partner = row.source_character_id === characterId ? row.target_character_id : row.source_character_id;
      if (partner) partners.add(partner);
    }
    return partners;
  }

  private async episodeIdSet(userId: string, characterId: string): Promise<Set<string>> {
    const { data } = await supabaseAdmin
      .from('character_memories')
      .select('journal_entry_id')
      .eq('user_id', userId)
      .eq('character_id', characterId);
    return new Set((data ?? []).map(r => r.journal_entry_id).filter(Boolean));
  }

  private async eventIdSet(userId: string, characterId: string): Promise<Set<string>> {
    const { data } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_id')
      .eq('user_id', userId)
      .eq('character_id', characterId);
    return new Set((data ?? []).map(r => r.event_id).filter(Boolean));
  }

  boostConfidenceFromOverlap(base: number, overlap: DeduplicationOverlap): number {
    let boost = base;
    if (overlap.sharedRelationships > 0) boost += 0.05 * Math.min(overlap.sharedRelationships, 3);
    if (overlap.sharedEpisodes > 0) boost += 0.04 * Math.min(overlap.sharedEpisodes, 5);
    if (overlap.sharedEvents > 0) boost += 0.03 * Math.min(overlap.sharedEvents, 5);
    return Math.min(boost, 0.99);
  }

  async findDuplicateGroups(userId: string): Promise<DuplicateGroup[]> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    const characters = (data ?? []) as CharacterRecord[];
    if (characters.length < 2) return [];

    const parent = new Map<string, string>();
    const find = (id: string): string => {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
      return parent.get(id)!;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };

    // Only union pairs with a DIRECT title-aware name match — no transitive
    // overlap-only chains (prevents unrelated characters collapsing together).
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const ca = characters[i];
        const cb = characters[j];
        const direct = matchCharacterName(ca.name, cb.name);
        if (!direct.matches || direct.confidence < 0.88) {
          // Check mention against aliases only when name match fails
          let aliasHit = false;
          for (const alias of [...(ca.alias ?? []), ...(cb.alias ?? [])]) {
            const m = matchCharacterName(ca.name, alias) ;
            if (m.matches && m.confidence >= 0.88) {
              aliasHit = true;
              break;
            }
          }
          if (!aliasHit) continue;
        }
        union(ca.id, cb.id);
      }
    }

    const groups = new Map<string, DuplicateGroup>();

    const rootMembers = new Map<string, CharacterRecord[]>();
    for (const char of characters) {
      const root = find(char.id);
      if (!rootMembers.has(root)) rootMembers.set(root, []);
      rootMembers.get(root)!.push(char);
    }

    return Array.from(rootMembers.entries())
      .filter(([, members]) => members.length > 1)
      .map(([, members]) => {
        const best = [...members].sort((a, b) => b.name.length - a.name.length)[0];
        return {
          canonicalId: best.id,
          canonicalName: best.name,
          duplicateIds: members.filter(m => m.id !== best.id).map(m => m.id),
          members: members.map(m => ({ id: m.id, name: m.name, confidence: 0.9 })),
          avgConfidence: 0.9,
        };
      });
  }

  async mergeDuplicateGroups(userId: string, dryRun = false): Promise<Array<{ group: DuplicateGroup; merged: boolean }>> {
    const groups = await this.findDuplicateGroups(userId);
    const results: Array<{ group: DuplicateGroup; merged: boolean }> = [];

    // Identity-safety guard: NEVER auto-merge a group that contains the self
    // character or any character the user explicitly marked distinct. A same-name
    // person (e.g. an estranged parent who shares the user's name) must be
    // user-confirmed, not silently folded into "self". These groups are returned
    // unmerged so the UI can ask "is this you, or a different person?".
    const { data: protectedRows } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId);
    const protectedIds = new Set(
      (protectedRows ?? [])
        .filter((r: any) => {
          const m = r.metadata ?? {};
          return m.is_self === true || m.is_user === true || m.distinct_from_self === true || m.confirmed_distinct === true;
        })
        .map((r: any) => r.id as string)
    );

    for (const group of groups) {
      if (dryRun) {
        results.push({ group, merged: false });
        continue;
      }
      const groupIds = [group.canonicalId, ...group.duplicateIds];
      if (groupIds.some((id) => protectedIds.has(id))) {
        logger.info({ userId, group: group.canonicalName }, 'Skipped auto-merge: group contains self/distinct character (needs user confirmation)');
        results.push({ group, merged: false });
        continue;
      }
      let mergedAny = false;
      for (const dupId of group.duplicateIds) {
        try {
          await characterMergeService.merge(userId, dupId, group.canonicalId);
          mergedAny = true;
          logger.info({ userId, source: dupId, target: group.canonicalId }, 'Merged duplicate character');
        } catch (err) {
          logger.warn({ err, userId, source: dupId, target: group.canonicalId }, 'Failed to merge duplicate character');
        }
      }
      results.push({ group, merged: mergedAny });
    }
    return results;
  }

  /** Probable duplicate report for audit docs. */
  async auditDuplicates(userId: string): Promise<Array<{
    a: CharacterRecord;
    b: CharacterRecord;
    confidence: number;
    method: string;
    overlap: DeduplicationOverlap;
  }>> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    const characters = (data ?? []) as CharacterRecord[];
    const out: Array<{
      a: CharacterRecord;
      b: CharacterRecord;
      confidence: number;
      method: string;
      overlap: DeduplicationOverlap;
    }> = [];

    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const score = this.scorePair(characters[i], characters[j]);
        if (score.confidence < 0.7) continue;
        const overlap = await this.computeOverlap(userId, characters[i].id, characters[j].id);
        const boosted = this.boostConfidenceFromOverlap(score.confidence, overlap);
        out.push({
          a: characters[i],
          b: characters[j],
          confidence: boosted,
          method: score.method,
          overlap,
        });
      }
    }
    return out.sort((x, y) => y.confidence - x.confidence);
  }
}

export const characterDeduplicationService = new CharacterDeduplicationService();
