/**
 * CharacterRegistry — the single decision point for character creation.
 *
 * Multiple pipelines create characters (people_places foundation, omega
 * promotion), each deduping only against its own source key. That guaranteed
 * one card per pipeline per person, plus LLM phrase-names like "Kelly who's
 * handling onboarding" and compounds like "Sam the Recruiter and Kelly
 * Onboarding Contact". Every creation path must call classifyForCreation()
 * before inserting.
 *
 * Decisions:
 *   reject — junk (pronouns, stopwords, known locations/orgs)
 *   merge  — certain match to an existing character (exact, alias, single
 *            first-name candidate, or near-perfect fuzzy)
 *   defer  — gray zone: do NOT create; record a pending entity question the
 *            chat asks the user about (sparse > wrong)
 *   create — certainly new
 *
 * Never-re-ask memory:
 *   - merge resolution adds the mention as an alias → exact match next time
 *   - "new person" resolution stamps distinct_from_mentions on the candidates
 *     → they are excluded as candidates for that mention forever
 *   - dismissed questions are never re-created for the same mention+candidates
 */

import { logger } from '../logger';
import { jaroWinkler } from '../utils/jaroWinkler';

import { supabaseAdmin } from './supabaseClient';

// Pronouns/contractions/generics the extractors keep emitting as "people".
const JUNK_NAMES = new Set([
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she',
  'her', 'hers', 'they', 'them', 'their', 'we', 'us', 'our', 'it', 'its',
  'ive', 'im', 'id', 'ill', 'youre', 'youve', 'hes', 'shes', 'theyre',
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody',
  'people', 'person', 'guy', 'girl', 'man', 'woman', 'narrator', 'user',
]);

export type NameGateResult =
  | { ok: true; cleanName: string; parts?: undefined }
  | { ok: true; cleanName: string; parts: string[] } // compound: process parts
  | { ok: false; reason: string };

export type CreationDecision =
  | { action: 'reject'; reason: string }
  | { action: 'merge'; characterId: string; matchedName: string; cleanName: string }
  | { action: 'create'; cleanName: string }
  | { action: 'defer'; cleanName: string; candidates: Array<{ character_id: string; name: string; subtitle?: string }> };

type CharacterRow = {
  id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, any> | null;
};

class CharacterRegistry {
  /**
   * Clean a raw extracted name and reject junk.
   * "Kelly who's handling onboarding" → "Kelly"
   * "Sam the Recruiter and Kelly Onboarding Contact" → parts: ["Sam", "Kelly Onboarding Contact"→cleaned recursively]
   */
  gateName(raw: string): NameGateResult {
    let name = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, reason: 'empty' };

    // Strip descriptive clauses: "Kelly who's handling onboarding" → "Kelly"
    name = name.replace(/\s+(?:who(?:'s|’s|se)?|whom|that|which)\b.*$/i, '').trim();
    // Strip leading articles
    name = name.replace(/^(?:the|a|an)\s+/i, '').trim();
    // Strip trailing role descriptors: "Sam the Recruiter" → "Sam"
    name = name.replace(/\s+the\s+[a-z][\w ]*$/i, '').trim();
    // Strip trailing punctuation
    name = name.replace(/[.,;:!?]+$/, '').trim();

    if (!name) return { ok: false, reason: 'empty_after_cleaning' };

    // Compound: "Sam and Kelly" — two people in one mention
    const compoundParts = name.split(/\s+(?:and|&)\s+/i).map(p => p.trim()).filter(Boolean);
    if (compoundParts.length > 1 && compoundParts.every(p => /^[A-ZÀ-Ý]/.test(p))) {
      return { ok: true, cleanName: name, parts: compoundParts };
    }

    if (name.length < 2) return { ok: false, reason: 'too_short' };
    if (JUNK_NAMES.has(name.toLowerCase())) return { ok: false, reason: 'junk_word' };
    // More than 5 tokens after cleaning is a sentence fragment, not a name
    if (name.split(' ').length > 5) return { ok: false, reason: 'phrase_not_name' };

    return { ok: true, cleanName: name };
  }

  /** Known location/org names must never become characters ("Smith Rock"). */
  private async isKnownNonPerson(userId: string, name: string): Promise<boolean> {
    const [loc, org] = await Promise.all([
      supabaseAdmin.from('locations').select('id').eq('user_id', userId).ilike('name', name).limit(1),
      supabaseAdmin.from('organizations').select('id').eq('user_id', userId).ilike('name', name).limit(1),
    ]);
    if (loc.data?.length || org.data?.length) return true;
    const { data: omega } = await supabaseAdmin
      .from('omega_entities')
      .select('id, type')
      .eq('user_id', userId)
      .ilike('primary_name', name)
      .in('type', ['LOCATION', 'ORG'])
      .limit(1);
    return Boolean(omega?.length);
  }

  /**
   * Decide what to do with an extracted person name. Single choke point for
   * every character-creating pipeline.
   */
  async classifyForCreation(userId: string, rawName: string): Promise<CreationDecision> {
    const gate = this.gateName(rawName);
    if (!gate.ok) return { action: 'reject', reason: gate.reason };
    // Compounds are handled by callers part-by-part; classify the first part
    // here and let the caller iterate. (Returned via gateName().parts.)
    const cleanName = gate.parts ? gate.parts[0] : gate.cleanName;

    if (await this.isKnownNonPerson(userId, cleanName)) {
      return { action: 'reject', reason: 'known_location_or_org' };
    }

    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    const existing = (data ?? []) as CharacterRow[];

    const mentionLower = cleanName.toLowerCase();
    const mentionFirst = mentionLower.split(' ')[0];
    const mentionHasSurname = mentionLower.includes(' ');

    // 1. Exact name or alias match → certain merge
    for (const c of existing) {
      if (c.name.toLowerCase() === mentionLower) {
        return { action: 'merge', characterId: c.id, matchedName: c.name, cleanName };
      }
      if ((c.alias ?? []).some(a => a.toLowerCase() === mentionLower)) {
        return { action: 'merge', characterId: c.id, matchedName: c.name, cleanName };
      }
    }

    // 2. Candidate set: shared first name, or strong fuzzy on the full name.
    //    Respect "not the same person" memory from previous answers.
    const candidates = existing.filter(c => {
      const distinct: string[] = c.metadata?.distinct_from_mentions ?? [];
      if (distinct.includes(mentionLower)) return false;
      const nameLower = c.name.toLowerCase();
      const candFirst = nameLower.split(' ')[0];
      const candHasSurname = nameLower.includes(' ');
      if (candFirst === mentionFirst) {
        // Same first name but BOTH have different surnames → different people
        if (mentionHasSurname && candHasSurname && nameLower !== mentionLower) return false;
        return true;
      }
      // Fuzzy full-name match (typos: Quintesa/Quintessa). Guarded by a high
      // threshold — JW on short names is noisy (Abuela vs Abel).
      return jaroWinkler(mentionLower, nameLower) >= 0.93;
    });

    if (candidates.length === 0) return { action: 'create', cleanName };

    // 3. Single candidate, one side is first-name-only → certain enough to
    //    merge ("Quintessa" ↔ "Quintessa Vexworth"). Asking here would spam.
    if (candidates.length === 1) {
      const cand = candidates[0];
      const nameLower = cand.name.toLowerCase();
      const oneSideFirstNameOnly = !mentionHasSurname || !nameLower.includes(' ');
      const jw = jaroWinkler(mentionLower, nameLower);
      if (oneSideFirstNameOnly || jw >= 0.97) {
        return { action: 'merge', characterId: cand.id, matchedName: cand.name, cleanName };
      }
    }

    // 4. Gray zone — multiple plausible people, or a fuzzy-but-not-certain
    //    match. Don't create; ask the user in chat.
    return {
      action: 'defer',
      cleanName,
      candidates: candidates.slice(0, 3).map(c => ({
        character_id: c.id,
        name: c.name,
        subtitle: c.metadata?.mention_count ? `mentioned ${c.metadata.mention_count}×` : undefined,
      })),
    };
  }

  /**
   * Apply a certain merge: record the mention as an alias (so the next
   * occurrence is an exact match), bump mention count, attach source keys so
   * the calling pipeline's own dedup also converges on this card.
   */
  async mergeMention(
    userId: string,
    characterId: string,
    mention: string,
    sourceMeta?: Record<string, unknown>,
    opts: { addAlias?: boolean } = {}
  ): Promise<void> {
    const addAlias = opts.addAlias ?? true;
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return;
    const row = data as CharacterRow;

    const aliases = new Set((row.alias ?? []).map(a => a));
    if (addAlias && mention.toLowerCase() !== row.name.toLowerCase()) aliases.add(mention);

    const metadata = {
      ...(row.metadata ?? {}),
      ...(sourceMeta ?? {}),
      mention_count: ((row.metadata?.mention_count as number) ?? 0) + 1,
    };

    await supabaseAdmin
      .from('characters')
      .update({ alias: aliases.size > 0 ? [...aliases] : null, metadata, updated_at: new Date().toISOString() })
      .eq('id', characterId)
      .eq('user_id', userId);
  }

  /**
   * Record a pending in-chat question for a gray-zone mention. Never creates
   * a duplicate question: one pending per mention, and a previously
   * resolved/dismissed question for the same mention+candidates is permanent
   * memory — we do not ask again.
   */
  async recordPendingQuestion(
    userId: string,
    mention: string,
    candidates: Array<{ character_id: string; name: string; subtitle?: string }>,
    threadId?: string | null
  ): Promise<void> {
    const mentionLower = mention.toLowerCase();
    const { data: existing } = await supabaseAdmin
      .from('entity_questions')
      .select('id, status, candidates')
      .eq('user_id', userId)
      .eq('mention_lower', mentionLower);

    for (const q of existing ?? []) {
      if (q.status === 'pending') return; // already queued
      // resolved/dismissed with same candidate set → permanent no-re-ask
      const prevIds = new Set(((q.candidates as any[]) ?? []).map(c => c.character_id));
      if (candidates.every(c => prevIds.has(c.character_id))) return;
    }

    await supabaseAdmin.from('entity_questions').insert({
      user_id: userId,
      thread_id: threadId ?? null,
      mention_text: mention,
      mention_lower: mentionLower,
      candidates,
      status: 'pending',
    });
    logger.info({ userId, mention, candidateCount: candidates.length }, 'Entity question queued for chat');
  }

  /**
   * Pop the next pending question for delivery in a chat response.
   * Anti-spam: max one per response (caller invokes once), each question is
   * asked at most twice (then silently dismissed), and resolved/dismissed
   * questions are permanent memory.
   */
  async takeNextPendingQuestion(userId: string): Promise<{
    question_id: string;
    mention_text: string;
    candidates: Array<{ character_id: string; name: string; subtitle?: string }>;
  } | null> {
    const { data } = await supabaseAdmin
      .from('entity_questions')
      .select('id, mention_text, candidates, asked_count')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3);

    for (const q of data ?? []) {
      if ((q.asked_count as number) >= 2) {
        // Asked twice without an answer — the user isn't interested; stop.
        await supabaseAdmin
          .from('entity_questions')
          .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
          .eq('id', q.id);
        continue;
      }
      await supabaseAdmin
        .from('entity_questions')
        .update({ asked_count: (q.asked_count as number) + 1 })
        .eq('id', q.id);
      return {
        question_id: q.id as string,
        mention_text: q.mention_text as string,
        candidates: (q.candidates as any[]) ?? [],
      };
    }
    return null;
  }

  /**
   * Apply the user's answer. Multi-select supported: the mention may refer to
   * one or several existing people, a new person, or be skipped.
   */
  async resolveQuestion(
    userId: string,
    questionId: string,
    answer: { selectedCharacterIds: string[]; createNew: boolean; skip: boolean }
  ): Promise<{ ok: boolean; createdCharacterId?: string }> {
    const { data: q } = await supabaseAdmin
      .from('entity_questions')
      .select('id, mention_text, candidates, status')
      .eq('id', questionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!q || q.status !== 'pending') return { ok: false };

    const mention = q.mention_text as string;
    const candidateIds = ((q.candidates as any[]) ?? []).map(c => c.character_id as string);
    const now = new Date().toISOString();

    if (answer.skip) {
      await supabaseAdmin
        .from('entity_questions')
        .update({ status: 'dismissed', resolved_at: now, resolution: { action: 'skip' } })
        .eq('id', questionId);
      return { ok: true };
    }

    let createdCharacterId: string | undefined;

    // Selected existing people: merge the mention into each. Alias only when
    // exactly one was selected — an alias shared across people would corrupt
    // future exact-matching.
    const selected = answer.selectedCharacterIds.filter(id => candidateIds.includes(id));
    for (const id of selected) {
      await this.mergeMention(userId, id, mention, undefined, { addAlias: selected.length === 1 && !answer.createNew });
    }

    if (answer.createNew) {
      // Mention is (also) a new person: create a minimal card and stamp
      // distinct_from on the non-selected candidates so we never re-match.
      const { v4: uuid } = await import('uuid');
      createdCharacterId = uuid();
      await supabaseAdmin.from('characters').insert({
        id: createdCharacterId,
        user_id: userId,
        name: mention,
        status: 'active',
        tags: [],
        importance_level: 'minor',
        relationship_depth: 'mentioned_only',
        metadata: { generated_by: 'user_clarification', generated_at: now, mention_count: 1 },
      });
    }
    const rejectedIds = candidateIds.filter(id => !selected.includes(id));
    if (answer.createNew && rejectedIds.length > 0) {
      await this.recordDistinctFrom(userId, mention, rejectedIds);
    }

    await supabaseAdmin
      .from('entity_questions')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolution: { action: answer.createNew ? 'new' : 'existing', selected, created_character_id: createdCharacterId ?? null },
      })
      .eq('id', questionId);

    return { ok: true, createdCharacterId };
  }

  /**
   * "New person" answers stamp distinct_from_mentions on the rejected
   * candidates so this mention never matches them again.
   */
  async recordDistinctFrom(userId: string, mention: string, characterIds: string[]): Promise<void> {
    const mentionLower = mention.toLowerCase();
    for (const id of characterIds) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('metadata')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) continue;
      const distinct: string[] = data.metadata?.distinct_from_mentions ?? [];
      if (distinct.includes(mentionLower)) continue;
      await supabaseAdmin
        .from('characters')
        .update({ metadata: { ...(data.metadata ?? {}), distinct_from_mentions: [...distinct, mentionLower] } })
        .eq('id', id)
        .eq('user_id', userId);
    }
  }
}

export const characterRegistry = new CharacterRegistry();
