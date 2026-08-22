/**
 * Relationship Foundation Service — Sprint D + Graph Recovery
 *
 * Mines existing stores (no LLM, no parallel graph):
 *   1. character_memories co-mention + protagonist linkage (journal)
 *   2. entity_facts relationship category + kinship patterns
 *   3. chat_messages co-mention
 *
 * Writes to character_relationships only.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { normalizeNameKey, namesOverlapByContainment } from '../utils/nameNormalization';
import { supabaseAdmin } from './supabaseClient';
import {
  RELATIONSHIP_DELTA_BUDGET,
  RELATIONSHIP_DELTA_OVERLAP_MS,
  RELATIONSHIP_RECOVERY_BUDGET,
} from './ingestion/deltaJobBudget';
import {
  RELATIONSHIP_FOUNDATION_PROCESSING_VERSION,
  advanceCursor,
  claimWorker,
  loadWorkerCursor,
  logDeltaReport,
  overlapIso,
  releaseWorker,
  saveWorkerCursor,
  type WorkerRunMode,
} from './ingestion/workerHighWaterMark';
import {
  addPairsToDirtySet,
  characterPairKey,
  dirtySetFromEvidence,
  emptyRelationshipDeltaReport,
  mergeUniqueIds,
  parsePairKey,
  relationshipCanonicalUnchanged,
  uniquePairsFromCharacterIds,
  type RelationshipDeltaReport,
  type RelationshipEvidenceRef,
} from './relationships/relationshipDelta';

export type FoundationRelType =
  | 'romantic'
  | 'family'
  | 'friend'
  | 'acquaintance'
  | 'coworker'
  | 'teammate'
  | 'mentor'
  | 'unknown';

export type ParsedRelationshipFact = {
  relType: FoundationRelType;
  kinship?: string;
  /** Edge is protagonist (narrator) → holder entity */
  protagonistToHolder?: boolean;
  /** Other character name mentioned in fact */
  targetName?: string;
  status?: string;
};

const TYPE_PATTERNS: [FoundationRelType, RegExp][] = [
  ['romantic', /\b(romantic|dating|girlfriend|boyfriend|blocked|no contact|broke up|breakup|left.*on read|intimate|hooking up|ex\b|boyfriend of|girlfriend of|is (?:her|his) boyfriend)\b/i],
  ['family', /\b(abuela|grandmoth|grandma|grandfather|grandpa|mother|father|mom\b|dad\b|sibling|sister|brother|family|parent|uncle|aunt|t[íi]o|t[íi]a|cousin|relative|nephew|niece|in-law|step\s*dad|step\s*mom|grandson|granddaughter|grandchild)\b/i],
  ['mentor', /\b(mentor|coding mentor|coach|teacher|professor|instructor|guide|tutor)\b/i],
  ['coworker', /\b(coworker|colleague|recruiter|interview|onboarding|work(s)?\s+(with|together)|office|manager|boss|supervisor|employee|intern|amazon engineer)\b/i],
  ['teammate', /\b(teammate|team\s*mate|on\s+the\s+team|squad|training\s+partner|bandmate)\b/i],
  ['friend', /\b(friend|buddy|pal|bestie|homie|hang\s*out|kick\s+it|grew\s+up\s+with|met the narrator|added the narrator|bought the narrator|danced with the narrator)\b/i],
  ['acquaintance', /\b(met|acquaintance|know\s+of|ran\s+into|bumped\s+into|scene connection)\b/i],
];

/** Parse a single entity_fact into a relationship edge signal. Pure. */
export function parseRelationshipFact(fact: string): ParsedRelationshipFact | null {
  const text = fact.trim();
  if (!text) return null;

  const narratorKinship = text.match(
    /is the narrator'?s\s+(grandmother|grandma|abuela|grandfather|grandpa|grandson|granddaughter|mother|mom|father|dad|uncle|aunt|t[íi]o|t[íi]a|cousin|sister|brother|step\s*(?:mom|mother|dad|father)|son|daughter)/i
  );
  if (narratorKinship) {
    return { relType: 'family', kinship: narratorKinship[1].toLowerCase(), protagonistToHolder: true };
  }

  const hasNamed = text.match(
    /has an?\s+(uncle|aunt|t[íi]o|t[íi]a|cousin|brother|sister|grandmother|grandma|grandfather|grandpa|mother|mom|father|dad|boyfriend|girlfriend)\s+named\s+(.+)/i
  );
  if (hasNamed) {
    const relType = /boyfriend|girlfriend/i.test(hasNamed[1]) ? 'romantic' : 'family';
    return {
      relType,
      kinship: hasNamed[1].toLowerCase(),
      targetName: hasNamed[2].replace(/[.,;]+$/, '').trim(),
      protagonistToHolder: true,
    };
  }

  if (/has a grandmother/i.test(text)) {
    return { relType: 'family', kinship: 'grandmother', targetName: 'Abuela', protagonistToHolder: true };
  }

  const bfOf = text.match(/is the boyfriend of\s+(.+)/i);
  if (bfOf) {
    return { relType: 'romantic', kinship: 'boyfriend', targetName: bfOf[1].replace(/[.,;]+$/, '').trim() };
  }

  if (/is (?:her|his|their) boyfriend/i.test(text) || /is her boyfriend/i.test(text)) {
    return { relType: 'romantic', kinship: 'boyfriend' };
  }

  if (/boyfriend named\s+(\w+)/i.test(text)) {
    const m = text.match(/boyfriend named\s+(.+)/i);
    return { relType: 'romantic', kinship: 'boyfriend', targetName: m?.[1]?.replace(/[.,;]+$/, '').trim() };
  }

  if (/oscuri\.?dad is her boyfriend/i.test(text)) {
    return { relType: 'romantic', kinship: 'boyfriend', targetName: 'Oscuri.dad' };
  }

  if (/met the narrator|added the narrator|bought the narrator a drink|danced with the narrator/i.test(text)) {
    return { relType: 'friend', protagonistToHolder: true };
  }

  if (/interview|recruiter|onboarding|identity verification/i.test(text)) {
    return { relType: 'coworker', kinship: 'recruiter', protagonistToHolder: true };
  }

  if (/mentor/i.test(text)) {
    return { relType: 'mentor', protagonistToHolder: true };
  }

  if (/blocked|no contact|broke up|left.*on read/i.test(text)) {
    return { relType: 'romantic', status: 'ended', protagonistToHolder: true };
  }

  const livesWith = text.match(/\b(lives with|living with|same household as|household includes)\b/i);
  if (livesWith) {
    return { relType: 'family', kinship: 'household', protagonistToHolder: /narrator/i.test(text) };
  }

  const stepParent = text.match(/\b(step\s*(?:dad|father|mom|mother))\b/i);
  if (stepParent && /narrator/i.test(text)) {
    return { relType: 'family', kinship: stepParent[1].toLowerCase().replace(/\s+/g, ' '), protagonistToHolder: true };
  }

  const sibling = text.match(/\b(narrator'?s\s+)?(brother|sister|sibling)\b/i);
  if (sibling && /narrator/i.test(text)) {
    return { relType: 'family', kinship: sibling[2]?.toLowerCase() ?? 'sibling', protagonistToHolder: true };
  }

  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(text)) return { relType: type, protagonistToHolder: /narrator/i.test(text) };
  }

  return null;
}

export function resolveCharacterIdByName(
  name: string,
  chars: Array<{ id: string; name: string }>
): string | null {
  const key = normalizeNameKey(name);
  if (!key) return null;

  const exact = chars.find((c) => normalizeNameKey(c.name) === key);
  if (exact) return exact.id;

  const contains = chars.filter(
    (c) => namesOverlapByContainment(key, normalizeNameKey(c.name))
  );
  if (contains.length === 1) return contains[0].id;

  // First-name match when unambiguous
  const first = key.split(' ')[0];
  const firstMatches = chars.filter((c) => normalizeNameKey(c.name).split(' ')[0] === first);
  if (firstMatches.length === 1) return firstMatches[0].id;

  return null;
}

function inferRelationshipType(content: string): FoundationRelType {
  for (const [type, pattern] of TYPE_PATTERNS) {
    if (pattern.test(content)) return type;
  }
  return 'unknown';
}

function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function pairKey(idA: string, idB: string): string {
  return characterPairKey(idA, idB);
}

type CharacterRow = { id: string; name: string; metadata?: Record<string, unknown> };

type RelationshipRow = {
  id: string;
  user_id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  status: string;
  metadata: Record<string, unknown>;
};

type ExistingRel = {
  id: string;
  relationship_type: string;
  status: string;
  metadata: Record<string, unknown>;
};

export type UpsertOutcome = 'created' | 'updated' | 'unchanged' | 'skipped';

export type RecoveryStats = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  pairs: number;
  fromMemories: number;
  fromFacts: number;
  fromChat: number;
  fromOrganizations: number;
  fromEvents: number;
  repaired: number;
  report: RelationshipDeltaReport;
};

export type RelationshipRecoveryOptions = {
  mode?: WorkerRunMode;
  maxRows?: number;
};

type ExtractScope = {
  pairKeys?: Set<string>;
  characterIds?: Set<string>;
  existingByPair?: Map<string, ExistingRel>;
  charMetaById?: Map<string, Record<string, unknown>>;
  sinceIso?: string | null;
};

function tally(stats: RecoveryStats, outcome: UpsertOutcome): void {
  if (outcome === 'created') stats.created++;
  else if (outcome === 'updated') stats.updated++;
  else if (outcome === 'unchanged') stats.unchanged++;
  else stats.skipped++;
}

const FAMILY_NAME_HINT =
  /\b(mom|mother|mamá|mama|dad|father|papá|papa|james|jerry|leslie|step\s*dad|stepdad|ben\b|abuela|t[íi]o|t[íi]a|uncle|aunt|ralph|grace|cousin|sibling|brother|sister)\b/i;

class RelationshipFoundationService {
  private validCharCache = new Map<string, Set<string>>();

  /** Cleared at the start of each recovery pass so inserts never target deleted characters. */
  private invalidateCharacterCache(userId: string): void {
    this.validCharCache.delete(userId);
  }

  private async validCharacterIds(userId: string): Promise<Set<string>> {
    const cached = this.validCharCache.get(userId);
    if (cached) return cached;
    const { data } = await supabaseAdmin.from('characters').select('id').eq('user_id', userId);
    const ids = new Set((data ?? []).map((c) => c.id));
    this.validCharCache.set(userId, ids);
    return ids;
  }

  private async bothCharactersExist(userId: string, idA: string, idB: string): Promise<boolean> {
    const valid = await this.validCharacterIds(userId);
    return valid.has(idA) && valid.has(idB);
  }

  async findProtagonist(userId: string, chars?: CharacterRow[]): Promise<CharacterRow | null> {
    const list =
      chars ??
      ((
        await supabaseAdmin.from('characters').select('id, name, metadata').eq('user_id', userId)
      ).data as CharacterRow[] | null) ??
      [];

    const me =
      list.find((c) => /^me$/i.test(c.name)) ??
      list.find((c) => /abel\s+mendoza/i.test(c.name));
    if (me) return me;

    let best: CharacterRow | null = null;
    let max = -1;
    for (const c of list) {
      const count = Number((c.metadata as Record<string, unknown>)?.mention_count ?? 0);
      if (count > max) {
        max = count;
        best = c;
      }
    }
    return best;
  }

  /** Full recovery: journal + facts + chat + orgs + repair pass. */
  async recoverRelationshipGraph(
    userId: string,
    options: RelationshipRecoveryOptions = {},
  ): Promise<RecoveryStats> {
    const mode: WorkerRunMode = options.mode ?? 'recovery';
    const empty = (): RecoveryStats => ({
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      pairs: 0,
      fromMemories: 0,
      fromFacts: 0,
      fromChat: 0,
      fromOrganizations: 0,
      fromEvents: 0,
      repaired: 0,
      report: emptyRelationshipDeltaReport(userId, mode),
    });

    if (!claimWorker(userId, 'relationship_foundation')) {
      const stats = empty();
      stats.report.writesSkipped = 1;
      return stats;
    }

    this.invalidateCharacterCache(userId);
    const budget = mode === 'delta' ? RELATIONSHIP_DELTA_BUDGET : RELATIONSHIP_RECOVERY_BUDGET;
    const maxRows = Math.min(options.maxRows ?? budget.maxRows, budget.maxRows);

    try {
      const cursor = await loadWorkerCursor(userId, 'relationship_foundation', RELATIONSHIP_FOUNDATION_PROCESSING_VERSION);
      const sinceIso = mode === 'delta' ? overlapIso(cursor.lastProcessedAt, RELATIONSHIP_DELTA_OVERLAP_MS) : null;
      const report = emptyRelationshipDeltaReport(userId, mode, cursor.lastProcessedAt);

      const existingByPair = await this.loadExistingByPair(userId);
      report.pairsLoaded = existingByPair.size;
      const charMetaById = await this.loadCharacterMeta(userId);

      let scope: ExtractScope = { existingByPair, charMetaById };
      let newestAt: string | null = cursor.lastProcessedAt;
      let newestId: string | null = cursor.lastId;

      if (mode === 'delta') {
        const delta = await this.collectDeltaEvidence(userId, sinceIso, maxRows, cursor.failedIds);
        report.sourcesScanned = delta.refs.length;
        const derived = dirtySetFromEvidence(delta.refs);
        const protagonist = await this.findProtagonist(userId);
        if (protagonist) {
          for (const ref of delta.refs) {
            if (ref.kind === 'entity_fact' && ref.characterIds[0]) {
              addPairsToDirtySet(derived.dirty, [protagonist.id, ref.characterIds[0]]);
              derived.characterIds.add(protagonist.id);
            }
            if ((ref.kind === 'chat_message' || ref.kind === 'journal_entry') && ref.characterIds.length > 0) {
              addPairsToDirtySet(derived.dirty, [protagonist.id, ...ref.characterIds]);
              derived.characterIds.add(protagonist.id);
            }
          }
        }
        report.sourcesChanged = derived.dirty.size > 0 ? delta.refs.length : 0;
        report.affectedCharacters = derived.characterIds.size;
        report.candidatePairs = derived.dirty.size;
        let pairKeys = [...derived.dirty];
        if (pairKeys.length > maxRows) pairKeys = pairKeys.slice(0, maxRows);
        report.uniquePairs = pairKeys.length;
        newestAt = delta.newestAt ?? derived.newestAt;
        newestId = delta.newestId;
        if (pairKeys.length === 0) {
          report.cursorAfter = cursor.lastProcessedAt;
          logDeltaReport({
            worker: 'relationship_foundation',
            userId,
            mode,
            rowsScanned: report.sourcesScanned,
            rowsNew: 0,
            rowsChanged: 0,
            rowsSkippedAlreadyProcessed: 0,
            llmCalls: 0,
            embeddingCalls: 0,
            writes: 0,
            cursorBefore: cursor.lastProcessedAt,
            cursorAfter: cursor.lastProcessedAt,
            retryCount: cursor.failedIds.length,
          });
          return { ...empty(), report };
        }
        scope = {
          pairKeys: new Set(pairKeys),
          characterIds: derived.characterIds,
          existingByPair,
          charMetaById,
          sinceIso,
        };
      }

      const totals = empty();
      totals.report = report;

      const mem = await this.extractRelationshipsFromMemories(userId, scope);
      totals.created += mem.created;
      totals.updated += mem.updated;
      totals.unchanged += mem.unchanged;
      totals.skipped += mem.skipped;
      totals.pairs += mem.pairs;
      totals.fromMemories = mem.pairs;

      const facts = await this.extractRelationshipsFromEntityFacts(userId, scope);
      totals.created += facts.created;
      totals.updated += facts.updated;
      totals.unchanged += facts.unchanged;
      totals.skipped += facts.skipped;
      totals.pairs += facts.pairs;
      totals.fromFacts = facts.pairs;

      const chat = await this.extractRelationshipsFromChatCoMention(userId, scope);
      totals.created += chat.created;
      totals.updated += chat.updated;
      totals.unchanged += chat.unchanged;
      totals.skipped += chat.skipped;
      totals.pairs += chat.pairs;
      totals.fromChat = chat.pairs;

      const orgs = await this.extractRelationshipsFromOrganizations(userId, scope);
      totals.created += orgs.created;
      totals.updated += orgs.updated;
      totals.unchanged += orgs.unchanged;
      totals.skipped += orgs.skipped;
      totals.pairs += orgs.pairs;
      totals.fromOrganizations = orgs.pairs;

      if (mode === 'delta') {
        const events = await this.extractRelationshipsFromResolvedEvents(userId, scope);
        totals.created += events.created;
        totals.updated += events.updated;
        totals.unchanged += events.unchanged;
        totals.skipped += events.skipped;
        totals.pairs += events.pairs;
        totals.fromEvents = events.pairs;
      }

      const repaired = await this.repairMisclassifiedRelationships(userId, scope.pairKeys);
      totals.repaired = repaired.repaired;
      totals.updated += repaired.repaired;

      report.pairsRecomputed = totals.pairs;
      report.pairsChanged = totals.created + totals.updated;
      report.pairsUnchanged = totals.unchanged;
      report.writes = totals.created + totals.updated;
      report.writesSkipped = totals.unchanged + totals.skipped;
      report.llmCalls = 0;

      if (mode === 'delta' && newestAt) {
        const next = advanceCursor(
          cursor,
          [{ id: newestId, at: newestAt }],
          [],
          RELATIONSHIP_FOUNDATION_PROCESSING_VERSION,
        );
        if (next.lastProcessedAt !== cursor.lastProcessedAt) {
          await saveWorkerCursor(userId, 'relationship_foundation', next);
        }
        report.cursorAfter = next.lastProcessedAt;
      }

      totals.report = report;
      logDeltaReport({
        worker: 'relationship_foundation',
        userId,
        mode,
        rowsScanned: report.sourcesScanned,
        rowsNew: report.sourcesChanged,
        rowsChanged: report.pairsChanged,
        rowsSkippedAlreadyProcessed: report.writesSkipped,
        llmCalls: 0,
        embeddingCalls: 0,
        writes: report.writes,
        cursorBefore: report.cursorBefore,
        cursorAfter: report.cursorAfter,
        retryCount: cursor.failedIds.length,
      });
      return totals;
    } finally {
      releaseWorker(userId, 'relationship_foundation');
    }
  }

  private async loadExistingByPair(userId: string): Promise<Map<string, ExistingRel>> {
    const { data } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, status, metadata')
      .eq('user_id', userId);
    const map = new Map<string, ExistingRel>();
    for (const row of data ?? []) {
      const key = pairKey(row.source_character_id, row.target_character_id);
      if (!map.has(key)) {
        map.set(key, {
          id: row.id,
          relationship_type: row.relationship_type,
          status: row.status,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        });
      }
    }
    return map;
  }

  private async loadCharacterMeta(userId: string): Promise<Map<string, Record<string, unknown>>> {
    const { data } = await supabaseAdmin.from('characters').select('id, metadata').eq('user_id', userId);
    return new Map((data ?? []).map((row) => [row.id as string, (row.metadata ?? {}) as Record<string, unknown>]));
  }

  private inScope(scope: ExtractScope | undefined, charAId: string, charBId: string): boolean {
    if (!scope?.pairKeys) return true;
    return scope.pairKeys.has(pairKey(charAId, charBId));
  }

  private async collectDeltaEvidence(
    userId: string,
    sinceIso: string | null,
    maxRows: number,
    failedIds: string[],
  ): Promise<{ refs: RelationshipEvidenceRef[]; newestAt: string | null; newestId: string | null }> {
    const refs: RelationshipEvidenceRef[] = [];
    let newestAt: string | null = null;
    let newestId: string | null = null;
    const note = (id: string | null, at: string | null) => {
      if (!at) return;
      if (!newestAt || at > newestAt) {
        newestAt = at;
        newestId = id;
      }
    };

    let eventQuery = supabaseAdmin
      .from('resolved_events')
      .select('id, people, title, summary, created_at, updated_at')
      .eq('user_id', userId);
    if (sinceIso) eventQuery = eventQuery.gte('updated_at', sinceIso);
    const { data: events } = await eventQuery.order('updated_at', { ascending: false }).limit(maxRows);
    for (const ev of events ?? []) {
      const people = Array.isArray(ev.people) ? (ev.people as string[]).filter(Boolean) : [];
      const at = String(ev.updated_at ?? ev.created_at ?? '');
      refs.push({ kind: 'resolved_event', id: ev.id, characterIds: people, at });
      note(ev.id, at);
    }

    let factQuery = supabaseAdmin
      .from('entity_facts')
      .select('id, entity_id, fact, created_at')
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('status', 'active');
    if (sinceIso) factQuery = factQuery.gte('created_at', sinceIso);
    const { data: facts } = await factQuery.limit(maxRows);
    for (const fact of facts ?? []) {
      const at = String(fact.created_at ?? '');
      refs.push({
        kind: 'entity_fact',
        id: fact.id,
        characterIds: fact.entity_id ? [fact.entity_id] : [],
        at,
      });
      note(fact.id, at);
    }

    const { data: charRows } = await supabaseAdmin.from('characters').select('id, name').eq('user_id', userId);
    const mentionIdsIn = (text: string): string[] => {
      if (!text) return [];
      const ids: string[] = [];
      for (const c of charRows ?? []) {
        const name = String(c.name ?? '');
        if (!name) continue;
        if (text.toLowerCase().includes(name.toLowerCase())) ids.push(c.id);
        else {
          const first = name.split(' ')[0];
          if (first.length > 2 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
            ids.push(c.id);
          }
        }
      }
      return ids;
    };

    const ingestChat = (m: { id?: string; content?: string | null; created_at?: string | null; edited_at?: string | null }) => {
      if (!m.id) return;
      const at = String(m.edited_at ?? m.created_at ?? '');
      refs.push({
        kind: 'chat_message',
        id: m.id,
        characterIds: mentionIdsIn(String(m.content ?? '')),
        at,
      });
      note(m.id, at);
    };
    if (sinceIso) {
      const [{ data: newMsgs }, { data: editedMsgs }] = await Promise.all([
        supabaseAdmin
          .from('chat_messages')
          .select('id, content, created_at, edited_at')
          .eq('user_id', userId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(maxRows),
        supabaseAdmin
          .from('chat_messages')
          .select('id, content, created_at, edited_at')
          .eq('user_id', userId)
          .gte('edited_at', sinceIso)
          .order('edited_at', { ascending: false })
          .limit(50),
      ]);
      const seen = new Set<string>();
      for (const m of [...(newMsgs ?? []), ...(editedMsgs ?? [])]) {
        if (!m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        ingestChat(m);
      }
    } else {
      const { data: chatMsgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at, edited_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(maxRows);
      for (const m of chatMsgs ?? []) ingestChat(m);
    }

    let memQuery = supabaseAdmin
      .from('character_memories')
      .select('id, character_id, journal_entry_id, created_at, updated_at')
      .eq('user_id', userId);
    if (sinceIso) memQuery = memQuery.gte('created_at', sinceIso);
    const { data: mems } = await memQuery.limit(maxRows);
    const byEntry = new Map<string, string[]>();
    for (const mem of mems ?? []) {
      const list = byEntry.get(mem.journal_entry_id) ?? [];
      list.push(mem.character_id);
      byEntry.set(mem.journal_entry_id, list);
      const at = String(mem.updated_at ?? mem.created_at ?? '');
      note(mem.id, at);
    }
    for (const [entryId, charIds] of byEntry) {
      refs.push({ kind: 'journal_entry', id: entryId, characterIds: charIds, at: newestAt ?? new Date().toISOString() });
    }

    if (failedIds.length > 0) {
      const { data: failedEvents } = await supabaseAdmin
        .from('resolved_events')
        .select('id, people, updated_at, created_at')
        .eq('user_id', userId)
        .in('id', failedIds.slice(0, 50));
      for (const ev of failedEvents ?? []) {
        refs.push({
          kind: 'resolved_event',
          id: ev.id,
          characterIds: Array.isArray(ev.people) ? (ev.people as string[]) : [],
          at: String(ev.updated_at ?? ev.created_at ?? ''),
        });
      }
    }

    return { refs, newestAt, newestId };
  }

  async extractRelationshipsFromMemories(userId: string, scope: ExtractScope = {}): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);

    if (!chars?.length) {
      logger.info({ userId }, 'No characters found — skipping relationship extraction');
      return stats;
    }

    let memQuery = supabaseAdmin
      .from('character_memories')
      .select('character_id, journal_entry_id')
      .eq('user_id', userId);
    if (scope.characterIds && scope.characterIds.size > 0) {
      memQuery = memQuery.in('character_id', [...scope.characterIds]);
    }
    const { data: memLinks } = await memQuery;

    const entryToChars = new Map<string, Set<string>>();
    for (const link of memLinks ?? []) {
      if (scope.characterIds && !scope.characterIds.has(link.character_id)) continue;
      if (!entryToChars.has(link.journal_entry_id)) {
        entryToChars.set(link.journal_entry_id, new Set());
      }
      entryToChars.get(link.journal_entry_id)!.add(link.character_id);
    }

    const pairSharedEntries = new Map<string, Set<string>>();
    for (const [entryId, charSet] of entryToChars) {
      const charList = Array.from(charSet);
      for (const key of uniquePairsFromCharacterIds(charList)) {
        if (scope.pairKeys && !scope.pairKeys.has(key)) continue;
        if (!pairSharedEntries.has(key)) pairSharedEntries.set(key, new Set());
        pairSharedEntries.get(key)!.add(entryId);
      }
    }

    const allEntryIds = [...new Set([...pairSharedEntries.values()].flatMap((s) => [...s]))];
    const { data: entryRows } = allEntryIds.length
      ? await supabaseAdmin.from('journal_entries').select('id, content, mood, tags').in('id', allEntryIds.slice(0, 200))
      : { data: [] as Array<{ id: string; content: string; mood?: string; tags?: string[] }> };
    const entryById = new Map((entryRows ?? []).map((e) => [e.id as string, e]));

    for (const [key, sharedEntrySet] of pairSharedEntries) {
      const parsed = parsePairKey(key);
      if (!parsed) continue;
      const [charAId, charBId] = parsed;
      const sharedEntryIds = Array.from(sharedEntrySet);
      stats.pairs++;

      const combinedContent = sharedEntryIds
        .map((id) => entryById.get(id))
        .filter(Boolean)
        .slice(0, 10)
        .map((e) => [e!.content, (e!.tags ?? []).join(' ')].join(' '))
        .join('\n');

      const relType = inferRelationshipType(combinedContent);
      const outcome = await this.upsertRelationship(userId, {
        charAId,
        charBId,
        relType,
        evidenceIds: sharedEntryIds,
        source: 'journal_comention',
      }, scope);
      tally(stats, outcome);
    }

    return stats;
  }

  async extractRelationshipsFromEntityFacts(userId: string, scope: ExtractScope = {}): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);
    if (!protagonist) return stats;

    const validIds = new Set(chars.map((c) => c.id));

    let factQuery = supabaseAdmin
      .from('entity_facts')
      .select('id, fact, category, entity_id, confidence')
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('status', 'active');
    if (scope.characterIds && scope.characterIds.size > 0) {
      factQuery = factQuery.in('entity_id', [...scope.characterIds]);
    }
    const { data: facts } = await factQuery;

    const processed = new Set<string>();

    for (const row of facts ?? []) {
      if (!validIds.has(row.entity_id)) continue;

      const parsed =
        row.category === 'relationship' || row.category === 'history' || row.category === 'general'
          ? parseRelationshipFact(String(row.fact ?? ''))
          : null;
      if (!parsed) continue;

      let charAId: string | null = null;
      let charBId: string | null = null;

      if (parsed.protagonistToHolder) {
        charAId = protagonist.id;
        charBId = row.entity_id;
        if (parsed.targetName && row.entity_id === protagonist.id) {
          const resolved = resolveCharacterIdByName(parsed.targetName, chars);
          if (resolved) charBId = resolved;
        }
      } else if (parsed.targetName) {
        charAId = row.entity_id;
        charBId = resolveCharacterIdByName(parsed.targetName, chars);
      }

      if (!charAId || !charBId || charAId === charBId) continue;
      if (!validIds.has(charAId) || !validIds.has(charBId)) continue;

      if (!this.inScope(scope, charAId, charBId)) continue;

      const dedupeKey = `${pairKey(charAId, charBId)}::${parsed.relType}`;
      if (processed.has(dedupeKey)) continue;
      processed.add(dedupeKey);

      stats.pairs++;
      const outcome = await this.upsertRelationship(userId, {
        charAId,
        charBId,
        relType: parsed.relType,
        evidenceIds: [row.id],
        source: 'entity_facts',
        kinship: parsed.kinship,
        status: parsed.status ?? 'active',
        confidence: Number(row.confidence ?? 0.8),
      }, scope);
      tally(stats, outcome);
    }

    return stats;
  }

  async extractRelationshipsFromChatCoMention(userId: string, scope: ExtractScope = {}): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);
    if (!protagonist) return stats;

    let msgQuery = supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, edited_at')
      .eq('user_id', userId);
    if (scope.sinceIso) msgQuery = msgQuery.gte('created_at', scope.sinceIso);
    const { data: chatMsgs } = await msgQuery.order('created_at', { ascending: false }).limit(500);

    const messages: Array<{ id: string; content: string }> = [];
    for (const m of chatMsgs ?? []) {
      if (m.id && m.content) messages.push({ id: m.id, content: String(m.content) });
    }

    if (!scope.pairKeys) {
      const { data: sessions } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id, metadata')
        .eq('user_id', userId);
      for (const s of sessions ?? []) {
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        const msgs = meta.messages as Array<{ content?: string }> | undefined;
        if (!Array.isArray(msgs)) continue;
        for (const m of msgs) {
          if (m.content) messages.push({ id: `session:${s.id}`, content: String(m.content) });
        }
      }
    }

    const mentionIdsIn = (text: string): string[] => {
      const ids: string[] = [];
      for (const c of chars) {
        const name = String(c.name ?? '');
        if (!name) continue;
        if (text.toLowerCase().includes(name.toLowerCase())) ids.push(c.id);
        else {
          const first = name.split(' ')[0];
          if (first.length > 2 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
            ids.push(c.id);
          }
        }
      }
      return ids;
    };

    const pairAcc = new Map<string, { messageIds: string[]; snippets: string[]; otherId: string }>();
    for (const msg of messages) {
      const mentioned = mentionIdsIn(msg.content);
      for (const key of uniquePairsFromCharacterIds([protagonist.id, ...mentioned])) {
        if (scope.pairKeys && !scope.pairKeys.has(key)) continue;
        const parsed = parsePairKey(key);
        if (!parsed) continue;
        const otherId = parsed[0] === protagonist.id ? parsed[1] : parsed[0];
        const acc = pairAcc.get(key) ?? { messageIds: [], snippets: [], otherId };
        const merged = mergeUniqueIds(acc.messageIds, [msg.id]);
        acc.messageIds = merged.next;
        if (merged.added.length > 0) acc.snippets.push(msg.content);
        pairAcc.set(key, acc);
      }
    }

    const otherById = new Map(chars.map((c) => [c.id, c.name]));

    for (const [key, acc] of pairAcc) {
      const parsed = parsePairKey(key);
      if (!parsed) continue;
      const otherName = otherById.get(acc.otherId) ?? '';
      const localContext = acc.snippets.slice(0, 8).join('\n');
      let relType = inferRelationshipType(localContext);
      if (/mentor/i.test(otherName)) relType = 'mentor';
      if (/step\s*dad|stepdad/i.test(otherName)) relType = 'family';
      if (FAMILY_NAME_HINT.test(otherName) && relType === 'romantic') relType = 'family';
      if (/^kelly$/i.test(otherName.trim()) && /interview|recruiter|amazon|onboard/i.test(localContext)) {
        relType = 'coworker';
      }

      const kinship = FAMILY_NAME_HINT.test(otherName)
        ? (/\babuela/i.test(otherName)
            ? 'grandmother'
            : /step\s*dad|stepdad|ben/i.test(otherName)
              ? 'stepfather'
              : /^mom$/i.test(otherName)
                ? 'mother'
                : /juan|ralph/i.test(otherName)
                  ? 'uncle'
                  : /grace/i.test(otherName)
                    ? 'aunt'
                    : /james|jerry|leslie/i.test(otherName)
                      ? // These are known extended-family given names in founder lore —
                        // cousins, not siblings. Prefer cousin so recovery doesn't fight
                        // family_override / tree placement.
                        'cousin'
                      : undefined)
        : undefined;

      stats.pairs++;
      const outcome = await this.upsertRelationship(userId, {
        charAId: parsed[0],
        charBId: parsed[1],
        relType,
        evidenceIds: acc.messageIds,
        source: 'chat_comention',
        confidence: 0.55,
        kinship,
      }, scope);
      tally(stats, outcome);
    }

    return stats;
  }

  /** Household / family org rosters → protagonist edges with household kinship. */
  async extractRelationshipsFromOrganizations(userId: string, scope: ExtractScope = {}): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);
    if (!protagonist) return stats;

    const { data: members } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id, character_id, character_name, role')
      .eq('user_id', userId);

    if (!members?.length) return stats;

    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name, group_type, metadata')
      .eq('user_id', userId);

    const householdOrgIds = new Set(
      (orgs ?? [])
        .filter(
          (o) =>
            /household|family|home/i.test(String(o.group_type ?? '')) ||
            /household|family|home/i.test(String(o.name ?? ''))
        )
        .map((o) => o.id)
    );

    const protagonistOrgIds = new Set(
      members.filter((m) => m.character_id === protagonist.id).map((m) => m.organization_id)
    );

    const targetOrgIds = householdOrgIds.size
      ? [...householdOrgIds]
      : [...protagonistOrgIds];

    for (const orgId of targetOrgIds) {
      const roster = members.filter((m) => m.organization_id === orgId);
      for (const member of roster) {
        let otherId = member.character_id as string | null;
        if (!otherId && member.character_name) {
          otherId = resolveCharacterIdByName(String(member.character_name), chars);
        }
        if (!otherId || otherId === protagonist.id) continue;
        if (!this.inScope(scope, protagonist.id, otherId)) continue;

        stats.pairs++;
        const outcome = await this.upsertRelationship(userId, {
          charAId: protagonist.id,
          charBId: otherId,
          relType: 'family',
          evidenceIds: [orgId],
          source: 'organization_members',
          kinship: 'household',
          confidence: 0.7,
        }, scope);
        tally(stats, outcome);
      }
    }

    return stats;
  }

  async extractRelationshipsFromResolvedEvents(userId: string, scope: ExtractScope = {}): Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, pairs: 0 };

    let query = supabaseAdmin
      .from('resolved_events')
      .select('id, people, title, summary, updated_at, created_at')
      .eq('user_id', userId);
    if (scope.sinceIso) query = query.gte('updated_at', scope.sinceIso);
    const { data: events } = await query.order('updated_at', { ascending: false }).limit(scope.pairKeys ? 200 : 500);

    const seen = new Set<string>();
    for (const ev of events ?? []) {
      const people = Array.isArray(ev.people) ? (ev.people as string[]).filter(Boolean) : [];
      const context = [ev.title, ev.summary].filter(Boolean).join(' ');
      let relType = inferRelationshipType(context);
      if (relType === 'unknown') relType = 'acquaintance';
      for (const key of uniquePairsFromCharacterIds(people)) {
        if (scope.pairKeys && !scope.pairKeys.has(key)) continue;
        const parsed = parsePairKey(key);
        if (!parsed) continue;
        const dedupe = `${key}::${ev.id}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        stats.pairs++;
        const outcome = await this.upsertRelationship(userId, {
          charAId: parsed[0],
          charBId: parsed[1],
          relType,
          evidenceIds: [ev.id],
          source: 'resolved_event',
          confidence: 0.45,
        }, scope);
        tally(stats, outcome);
      }
    }

    return stats;
  }

  /** Fix chat-noise romantic edges on family-titled characters when facts don't support romance. */
  async repairMisclassifiedRelationships(userId: string, pairKeys?: Set<string>): Promise<{ repaired: number }> {
    let repaired = 0;

    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('id, relationship_type, source_character_id, target_character_id, metadata')
      .eq('user_id', userId);

    if (!rels?.length) return { repaired: 0 };

    const charIds = [...new Set(rels.flatMap((r) => [r.source_character_id, r.target_character_id]))];
    const { data: chars } = await supabaseAdmin.from('characters').select('id, name').in('id', charIds);
    const nameMap = new Map((chars ?? []).map((c) => [c.id, c.name]));

    for (const rel of rels) {
      if (rel.relationship_type !== 'romantic') continue;
      if (pairKeys && !pairKeys.has(pairKey(rel.source_character_id, rel.target_character_id))) continue;
      const meta = (rel.metadata as Record<string, unknown>) ?? {};
      const factIds = (meta.fact_ids as string[]) ?? [];
      if (factIds.length > 0) continue;

      const otherId =
        rel.source_character_id === rel.target_character_id
          ? null
          : rel.source_character_id;
      const names = [nameMap.get(rel.source_character_id), nameMap.get(rel.target_character_id)];
      const otherName = names.find((n) => n && !/^me$/i.test(n)) ?? '';
      if (!FAMILY_NAME_HINT.test(otherName)) continue;

      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: 'family',
          metadata: {
            ...meta,
            kinship: (meta.kinship as string) ?? 'family',
            repaired_from: 'romantic',
            repaired_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', rel.id);
      repaired++;
    }

    return { repaired };
  }

  /** Assert a kinship edge from protagonist to a relative (message-scoped provenance). */
  async assertProtagonistKinship(
    userId: string,
    kinCharacterId: string,
    kinship: string,
    messageId: string,
    confidence = 0.85
  ): Promise<boolean> {
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);
    const protagonist = await this.findProtagonist(userId, (chars ?? []) as CharacterRow[]);
    if (!protagonist || protagonist.id === kinCharacterId) return false;

    const { assertTypedProtagonistKinshipEdge } = await import('./kinship/familyEdgeWriter');
    return assertTypedProtagonistKinshipEdge(userId, protagonist.id, kinCharacterId, kinship, {
      source: 'kinship_inference',
      inferenceStatus: 'inferred',
      closenessScore: Math.round(Math.min(10, Math.max(1, confidence * 10))),
      messageId,
      metadata: {
        confidence,
        source_memory_ids: messageId ? [messageId] : [],
        sources: ['kinship_inference'],
        generated_by: 'relationship_foundation',
      },
      summary: `Inferred kinship: ${kinship}`,
    });
  }

  private async upsertRelationship(
    userId: string,
    params: {
      charAId: string;
      charBId: string;
      relType: FoundationRelType;
      evidenceIds: string[];
      source: string;
      kinship?: string;
      status?: string;
      confidence?: number;
    },
    scope: ExtractScope = {},
  ): Promise<UpsertOutcome> {
    const [srcId, tgtId] = normalizePair(params.charAId, params.charBId);
    const key = pairKey(srcId, tgtId);

    if (scope.charMetaById) {
      if (!scope.charMetaById.has(srcId) || !scope.charMetaById.has(tgtId)) {
        logger.debug({ userId, srcId, tgtId, source: params.source }, 'Skipping relationship — character id missing');
        return 'skipped';
      }
    } else if (!(await this.bothCharactersExist(userId, srcId, tgtId))) {
      logger.debug({ userId, srcId, tgtId, source: params.source }, 'Skipping relationship — character id missing');
      return 'skipped';
    }

    // Never invent family edges for characters the user excluded from kin
    // (stage names like Oscuridad that share a given name with real relatives).
    if (params.relType === 'family') {
      const metaRows = scope.charMetaById
        ? [srcId, tgtId].map((id) => ({ id, metadata: scope.charMetaById!.get(id) ?? {} }))
        : ((await supabaseAdmin
            .from('characters')
            .select('id, metadata')
            .eq('user_id', userId)
            .in('id', [srcId, tgtId])).data ?? []);
      const excluded = metaRows.some((row) => {
        const flag = (row.metadata as Record<string, unknown> | null)?.family_excluded;
        if (flag === true) return true;
        if (flag && typeof flag === 'object' && (flag as { value?: unknown }).value === true) return true;
        return false;
      });
      if (excluded) {
        logger.debug({ userId, srcId, tgtId, source: params.source }, 'Skipping family edge — character is family_excluded');
        return 'skipped';
      }
    }

    const cached = scope.existingByPair?.get(key);
    let existing: ExistingRel | null = cached ?? null;
    if (!existing && !scope.existingByPair) {
      const { data } = await supabaseAdmin
        .from('character_relationships')
        .select('id, metadata, relationship_type, status')
        .eq('user_id', userId)
        .or(
          `and(source_character_id.eq.${srcId},target_character_id.eq.${tgtId}),and(source_character_id.eq.${tgtId},target_character_id.eq.${srcId})`
        )
        .limit(1);
      if (data?.[0]) {
        existing = {
          id: data[0].id,
          relationship_type: data[0].relationship_type,
          status: data[0].status ?? 'active',
          metadata: (data[0].metadata ?? {}) as Record<string, unknown>,
        };
      }
    }

    const evidenceBucket = (prev: Record<string, unknown>) => {
      if (params.source === 'entity_facts') return new Set<string>((prev.fact_ids as string[]) ?? []);
      if (params.source === 'resolved_event') return new Set<string>((prev.event_ids as string[]) ?? []);
      return new Set<string>((prev.source_memory_ids as string[]) ?? []);
    };

    const mergeMeta = (prev: Record<string, unknown>) => {
      const factIds = new Set<string>((prev.fact_ids as string[]) ?? []);
      const memoryIds = new Set<string>((prev.source_memory_ids as string[]) ?? []);
      const eventIds = new Set<string>((prev.event_ids as string[]) ?? []);
      for (const id of params.evidenceIds) {
        if (!id) continue;
        if (params.source === 'entity_facts') factIds.add(id);
        else if (params.source === 'resolved_event') eventIds.add(id);
        else memoryIds.add(id);
      }
      const sources = new Set<string>((prev.sources as string[]) ?? []);
      sources.add(params.source);
      return {
        ...prev,
        fact_ids: Array.from(factIds),
        source_memory_ids: Array.from(memoryIds),
        event_ids: Array.from(eventIds),
        sources: Array.from(sources),
        kinship: params.kinship ?? prev.kinship,
        confidence: Math.max(Number(prev.confidence ?? 0), params.confidence ?? 0),
        co_mention_count: factIds.size + memoryIds.size + eventIds.size,
        last_refreshed_at: new Date().toISOString(),
        generated_by: 'relationship_foundation',
      };
    };

    if (existing) {
      const prevMeta = existing.metadata ?? {};
      const hasFactEvidence = Array.isArray(prevMeta.fact_ids) && (prevMeta.fact_ids as string[]).length > 0;
      const prevKinship = prevMeta.kinship as string | undefined;

      let betterType = existing.relationship_type as FoundationRelType;
      if (params.source === 'entity_facts' && params.relType !== 'unknown') {
        betterType = params.relType;
      } else if (!hasFactEvidence && params.relType !== 'unknown') {
        betterType =
          existing.relationship_type === 'unknown' ? params.relType : existing.relationship_type as FoundationRelType;
      } else if (hasFactEvidence && prevKinship && params.source === 'chat_comention') {
        // Never let chat co-mention override fact-backed kinship edges.
        betterType = existing.relationship_type as FoundationRelType;
      } else if (
        hasFactEvidence &&
        existing.relationship_type === 'family' &&
        params.relType === 'romantic'
      ) {
        betterType = 'family';
      }

      const prevBucket = evidenceBucket(prevMeta);
      const hasNewEvidence = params.evidenceIds.some((id) => id && !prevBucket.has(id));
      const nextStatus = params.status ?? existing.status ?? 'active';
      const nextMeta = mergeMeta(prevMeta);
      const typeChanged = betterType !== existing.relationship_type;
      const statusChanged = nextStatus !== (existing.status ?? 'active');
      if (
        !hasNewEvidence &&
        !typeChanged &&
        !statusChanged &&
        relationshipCanonicalUnchanged(
          { relationship_type: existing.relationship_type, status: existing.status, metadata: prevMeta },
          { relationship_type: betterType, status: nextStatus, metadata: nextMeta },
        )
      ) {
        return 'unchanged';
      }

      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: betterType,
          status: nextStatus,
          metadata: nextMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (scope.existingByPair) {
        scope.existingByPair.set(key, {
          id: existing.id,
          relationship_type: betterType,
          status: nextStatus,
          metadata: nextMeta,
        });
      }
      return 'updated';
    }

    const row: RelationshipRow = {
      id: uuid(),
      user_id: userId,
      source_character_id: srcId,
      target_character_id: tgtId,
      relationship_type: params.relType,
      status: params.status ?? 'active',
      metadata: mergeMeta({
        generated_at: new Date().toISOString(),
      }),
    };

    const { error } = await supabaseAdmin.from('character_relationships').insert(row);
    if (error) {
      logger.warn({ error, srcId, tgtId }, 'Failed to insert relationship');
      return 'skipped';
    }
    if (scope.existingByPair) {
      scope.existingByPair.set(key, {
        id: row.id,
        relationship_type: row.relationship_type,
        status: row.status,
        metadata: row.metadata,
      });
    }
    return 'created';
  }

  async listRelationshipsWithNames(userId: string): Promise<
    Array<{
      id: string;
      characterA: string;
      characterB: string;
      type: string;
      status: string;
      kinship?: string;
      memoryCount: number;
      factCount: number;
    }>
  > {
    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, status, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!rels?.length) return [];

    const charIds = [...new Set(rels.flatMap((r) => [r.source_character_id, r.target_character_id]))];
    const { data: chars } = await supabaseAdmin.from('characters').select('id, name').in('id', charIds);

    const nameMap = new Map((chars ?? []).map((c) => [c.id, c.name]));

    return rels.map((r) => ({
      id: r.id,
      characterA: nameMap.get(r.source_character_id) ?? r.source_character_id,
      characterB: nameMap.get(r.target_character_id) ?? r.target_character_id,
      type: r.relationship_type,
      status: r.status,
      kinship: (r.metadata as Record<string, unknown>)?.kinship as string | undefined,
      memoryCount: ((r.metadata as Record<string, unknown>)?.source_memory_ids as string[])?.length ?? 0,
      factCount: ((r.metadata as Record<string, unknown>)?.fact_ids as string[])?.length ?? 0,
    }));
  }

  async buildCoverageReport(userId: string): Promise<{
    relationshipCount: number;
    byType: Record<string, number>;
    familyBenchmark: Record<string, boolean>;
    socialBenchmark: Record<string, boolean>;
    careerBenchmark: Record<string, boolean>;
    romanticBenchmark: Record<string, boolean>;
  }> {
    const rels = await this.listRelationshipsWithNames(userId);
    const byType: Record<string, number> = {};
    for (const r of rels) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }

    const hasEdge = (name: string) =>
      rels.some(
        (r) =>
          r.characterA.toLowerCase().includes(name.toLowerCase()) ||
          r.characterB.toLowerCase().includes(name.toLowerCase())
      );

    const familyNames = ['Mom', 'Step Dad Ben', 'Abuela', 'Juan', 'Grace', 'Ralph', 'Leslie', 'James', 'Jerry'];
    const socialNames = ['Andrew', 'Hell Fairy', 'Daisy', 'Oscuri', 'Baby Bats', 'Chino', 'Goth'];
    const careerNames = ['Kelly', 'Rafeh', 'Amazon', 'LoreBook', 'Robotics', 'Serve'];
    const romanticNames = ['Sol', 'Ashley'];

    const bench = (names: string[]) =>
      Object.fromEntries(names.map((n) => [n, hasEdge(n)]));

    return {
      relationshipCount: rels.length,
      byType,
      familyBenchmark: bench(familyNames),
      socialBenchmark: bench(socialNames),
      careerBenchmark: bench(careerNames),
      romanticBenchmark: bench(romanticNames),
    };
  }
}

export const relationshipFoundationService = new RelationshipFoundationService();
