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

export type RecoveryStats = {
  created: number;
  updated: number;
  pairs: number;
  fromMemories: number;
  fromFacts: number;
  fromChat: number;
  fromOrganizations: number;
  repaired: number;
};

const FAMILY_NAME_HINT =
  /\b(mom|mother|mamá|mama|dad|father|papá|papa|james|jerry|leslie|step\s*dad|stepdad|ben\b|abuela|t[íi]o|t[íi]a|uncle|aunt|ralph|grace|cousin|sibling|brother|sister)\b/i;

class RelationshipFoundationService {
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
  async recoverRelationshipGraph(userId: string): Promise<RecoveryStats> {
    const totals: RecoveryStats = {
      created: 0,
      updated: 0,
      pairs: 0,
      fromMemories: 0,
      fromFacts: 0,
      fromChat: 0,
      fromOrganizations: 0,
      repaired: 0,
    };

    const mem = await this.extractRelationshipsFromMemories(userId);
    totals.created += mem.created;
    totals.updated += mem.updated;
    totals.pairs += mem.pairs;
    totals.fromMemories = mem.pairs;

    const facts = await this.extractRelationshipsFromEntityFacts(userId);
    totals.created += facts.created;
    totals.updated += facts.updated;
    totals.pairs += facts.pairs;
    totals.fromFacts = facts.pairs;

    const chat = await this.extractRelationshipsFromChatCoMention(userId);
    totals.created += chat.created;
    totals.updated += chat.updated;
    totals.pairs += chat.pairs;
    totals.fromChat = chat.pairs;

    const orgs = await this.extractRelationshipsFromOrganizations(userId);
    totals.created += orgs.created;
    totals.updated += orgs.updated;
    totals.pairs += orgs.pairs;
    totals.fromOrganizations = orgs.pairs;

    const repaired = await this.repairMisclassifiedRelationships(userId);
    totals.repaired = repaired.repaired;
    totals.updated += repaired.repaired;

    return totals;
  }

  async extractRelationshipsFromMemories(userId: string): Promise<{
    created: number;
    updated: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);

    if (!chars?.length) {
      logger.info({ userId }, 'No characters found — skipping relationship extraction');
      return stats;
    }

    const charMap = new Map<string, { name: string; entryIds: string[] }>();
    for (const c of chars) {
      const entryIds: string[] = (c.metadata as Record<string, unknown>)?.source_entry_ids as string[] ?? [];
      charMap.set(c.id, { name: c.name, entryIds });
    }

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);

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

    if (protagonist) {
      for (const other of chars) {
        if (other.id === protagonist.id) continue;
        const [a, b] = normalizePair(protagonist.id, other.id);
        const key = `${a}::${b}`;
        if (!pairSharedEntries.has(key)) {
          const otherEntryIds = charMap.get(other.id)?.entryIds ?? [];
          pairSharedEntries.set(key, new Set(otherEntryIds));
        }
      }
    }

    for (const [pairKey, sharedEntrySet] of pairSharedEntries) {
      const [charAId, charBId] = pairKey.split('::');
      const sharedEntryIds = Array.from(sharedEntrySet);
      stats.pairs++;

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, mood, tags')
        .in('id', sharedEntryIds)
        .limit(10);

      const combinedContent = (entries ?? [])
        .map((e) => [e.content, (e.tags ?? []).join(' ')].join(' '))
        .join('\n');

      const relType = inferRelationshipType(combinedContent);
      const isNew = await this.upsertRelationship(userId, {
        charAId,
        charBId,
        relType,
        evidenceIds: sharedEntryIds,
        source: 'journal_comention',
      });

      if (isNew) stats.created++;
      else stats.updated++;
    }

    return stats;
  }

  async extractRelationshipsFromEntityFacts(userId: string): Promise<{
    created: number;
    updated: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);
    if (!protagonist) return stats;

    const { data: facts } = await supabaseAdmin
      .from('entity_facts')
      .select('id, fact, category, entity_id, confidence')
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('status', 'active');

    const processed = new Set<string>();

    for (const row of facts ?? []) {
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

      const pairKey = `${normalizePair(charAId, charBId).join('::')}::${parsed.relType}`;
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      stats.pairs++;
      const isNew = await this.upsertRelationship(userId, {
        charAId,
        charBId,
        relType: parsed.relType,
        evidenceIds: [row.id],
        source: 'entity_facts',
        kinship: parsed.kinship,
        status: parsed.status ?? 'active',
        confidence: Number(row.confidence ?? 0.8),
      });
      if (isNew) stats.created++;
      else stats.updated++;
    }

    return stats;
  }

  async extractRelationshipsFromChatCoMention(userId: string): Promise<{
    created: number;
    updated: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, pairs: 0 };

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId);
    if (!chars?.length) return stats;

    const protagonist = await this.findProtagonist(userId, chars as CharacterRow[]);

    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, metadata')
      .eq('user_id', userId);

    const messageTexts: string[] = [];

    const { data: chatMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('content')
      .eq('user_id', userId)
      .limit(500);
    for (const m of chatMsgs ?? []) {
      if (m.content) messageTexts.push(String(m.content));
    }

    for (const s of sessions ?? []) {
      const meta = (s.metadata ?? {}) as Record<string, unknown>;
      const msgs = meta.messages as Array<{ content?: string }> | undefined;
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m.content) messageTexts.push(String(m.content));
        }
      }
    }

    const combined = messageTexts.join('\n');
    const mentionedIds = new Set<string>();
    for (const c of chars) {
      if (combined.toLowerCase().includes(c.name.toLowerCase())) {
        mentionedIds.add(c.id);
      }
      const first = c.name.split(' ')[0];
      if (first.length > 2 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(combined)) {
        mentionedIds.add(c.id);
      }
    }

    const mentioned = Array.from(mentionedIds).filter((id) => id !== protagonist?.id);
    if (!protagonist) return stats;

    const otherById = new Map(chars.map((c) => [c.id, c.name]));

    for (const otherId of mentioned) {
      const otherName = otherById.get(otherId) ?? '';
      // Only use messages that mention this person — avoids Sol breakup text typing Abuela as romantic.
      const snippets = messageTexts.filter(
        (t) =>
          t.toLowerCase().includes(otherName.toLowerCase()) ||
          t.toLowerCase().includes(otherName.split(' ')[0].toLowerCase())
      );
      const localContext = snippets.slice(0, 8).join('\n');
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
                      ? 'sibling'
                      : undefined)
        : undefined;

      const [a, b] = normalizePair(protagonist.id, otherId);
      stats.pairs++;
      const isNew = await this.upsertRelationship(userId, {
        charAId: a,
        charBId: b,
        relType,
        evidenceIds: [],
        source: 'chat_comention',
        confidence: 0.55,
        kinship,
      });
      if (isNew) stats.created++;
      else stats.updated++;
    }

    return stats;
  }

  /** Household / family org rosters → protagonist edges with household kinship. */
  async extractRelationshipsFromOrganizations(userId: string): Promise<{
    created: number;
    updated: number;
    pairs: number;
  }> {
    const stats = { created: 0, updated: 0, pairs: 0 };

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

        stats.pairs++;
        const isNew = await this.upsertRelationship(userId, {
          charAId: protagonist.id,
          charBId: otherId,
          relType: 'family',
          evidenceIds: [],
          source: 'organization_members',
          kinship: 'household',
          confidence: 0.7,
        });
        if (isNew) stats.created++;
        else stats.updated++;
      }
    }

    return stats;
  }

  /** Fix chat-noise romantic edges on family-titled characters when facts don't support romance. */
  async repairMisclassifiedRelationships(userId: string): Promise<{ repaired: number }> {
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

    const [a, b] = normalizePair(protagonist.id, kinCharacterId);
    return this.upsertRelationship(userId, {
      charAId: a,
      charBId: b,
      relType: 'family',
      evidenceIds: messageId ? [messageId] : [],
      source: 'kinship_inference',
      kinship,
      confidence,
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
    }
  ): Promise<boolean> {
    const [srcId, tgtId] = normalizePair(params.charAId, params.charBId);

    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id, metadata, relationship_type')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${srcId},target_character_id.eq.${tgtId}),and(source_character_id.eq.${tgtId},target_character_id.eq.${srcId})`
      )
      .limit(1);

    const mergeMeta = (prev: Record<string, unknown>) => {
      const factIds = new Set<string>((prev.fact_ids as string[]) ?? []);
      const memoryIds = new Set<string>((prev.source_memory_ids as string[]) ?? []);
      for (const id of params.evidenceIds) {
        if (params.source === 'entity_facts') factIds.add(id);
        else memoryIds.add(id);
      }
      const sources = new Set<string>((prev.sources as string[]) ?? []);
      sources.add(params.source);
      return {
        ...prev,
        fact_ids: Array.from(factIds),
        source_memory_ids: Array.from(memoryIds),
        sources: Array.from(sources),
        kinship: params.kinship ?? prev.kinship,
        confidence: Math.max(Number(prev.confidence ?? 0), params.confidence ?? 0),
        co_mention_count: (Number(prev.co_mention_count ?? 0) || 0) + params.evidenceIds.length,
        last_refreshed_at: new Date().toISOString(),
        generated_by: 'relationship_foundation',
      };
    };

    if (existing?.[0]) {
      const prevMeta = (existing[0].metadata as Record<string, unknown>) ?? {};
      const hasFactEvidence = Array.isArray(prevMeta.fact_ids) && (prevMeta.fact_ids as string[]).length > 0;
      const prevKinship = prevMeta.kinship as string | undefined;

      let betterType = existing[0].relationship_type as FoundationRelType;
      if (params.source === 'entity_facts' && params.relType !== 'unknown') {
        betterType = params.relType;
      } else if (!hasFactEvidence && params.relType !== 'unknown') {
        betterType =
          existing[0].relationship_type === 'unknown' ? params.relType : existing[0].relationship_type;
      } else if (hasFactEvidence && prevKinship && params.source === 'chat_comention') {
        // Never let chat co-mention override fact-backed kinship edges.
        betterType = existing[0].relationship_type as FoundationRelType;
      } else if (
        hasFactEvidence &&
        existing[0].relationship_type === 'family' &&
        params.relType === 'romantic'
      ) {
        betterType = 'family';
      }

      // Dirty-check: skip the UPDATE when nothing material changed — no new
      // evidence id and the resolved type is unchanged. Without this, every
      // recovery run re-touches every existing edge (bumping co_mention_count +
      // timestamps), producing ~57 idle UPDATEs/run of pure write amplification.
      const prevFactIds = new Set<string>((prevMeta.fact_ids as string[]) ?? []);
      const prevMemIds = new Set<string>((prevMeta.source_memory_ids as string[]) ?? []);
      const hasNewEvidence = params.evidenceIds.some((id) =>
        params.source === 'entity_facts' ? !prevFactIds.has(id) : !prevMemIds.has(id)
      );
      const typeChanged = betterType !== existing[0].relationship_type;
      if (!hasNewEvidence && !typeChanged) {
        return false; // no-op — avoid the redundant write
      }

      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: betterType,
          status: params.status ?? 'active',
          metadata: mergeMeta(prevMeta),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);

      return false;
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
      return false;
    }
    return true;
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
