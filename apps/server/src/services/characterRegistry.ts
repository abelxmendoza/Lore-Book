/**
 * CharacterRegistry — the single decision point for character creation.
 *
 * Multiple pipelines create characters (people_places foundation, omega
 * promotion), each deduping only against its own source key. That guaranteed
 * one card per pipeline per person, plus LLM phrase-names like "Dana who's
 * handling onboarding" and compounds like "Reese the Recruiter and Dana
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
import { identityLedgerService } from './identity/identityLedgerService';
import { jaroWinkler } from '../utils/jaroWinkler';
import { normalizeNameKey, namesOverlapByContainment, containmentIsPossessive, splitPersonName } from '../utils/nameNormalization';
import {
  normalizeDisambiguationCandidates,
  threadUserHistoryReferencesMention,
  type DisambiguationCandidate,
} from '../utils/disambiguationUtils';
import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { isCollectivePersonName } from '../utils/personNameValidation';
import { classifyEntity, isCharacterEligible, isUnknownEntity } from './entities/entityClassifier';
import {
  characterCreationActionFromCore,
  characterToResolutionCandidate,
  compareCharacterCreationDecisions,
  logCharacterCreationShadowComparison,
  type CharacterResolutionRow,
} from './entities/entityResolutionBridge';
import {
  isEntityResolutionCoreActive,
  isEntityResolutionShadowEnabled,
} from './entities/entityResolutionConfig';
import { resolveMention, type ResolutionContext } from './entities/entityResolutionCore';
import {
  buildDisplayTitleFromMention,
  shouldAllowCharacterCreation,
} from './identity/dynamicCharacterTitleService';

import { characterAuthorityService } from './characterAuthorityService';
import { filterValidAliases, isValidAliasForCharacter } from './characters/aliasConstraintService';
import { isUserRejectedEntityCard } from './entityRejectionRegistry';
import { supabaseAdmin } from './supabaseClient';

// Pronouns/contractions/generics the extractors keep emitting as "people".
const JUNK_NAMES = new Set([
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she',
  'her', 'hers', 'they', 'them', 'their', 'we', 'us', 'our', 'it', 'its',
  'ive', 'im', 'id', 'ill', 'youre', 'youve', 'hes', 'shes', 'theyre',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'just', 'from',
  'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody',
  'people', 'person', 'guy', 'girl', 'man', 'woman', 'narrator', 'user',
]);

const NON_PERSON_NAME_PATTERNS = [
  /\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way)\b/i,
  /\b(?:pool|billiards|bar|club|venue|theater|theatre|restaurant|cafe|coffee|lounge|park|beach|arena|stadium)\b/i,
  /\b(?:show|event|anniversary|party|night|set)\b/i,
  /\b(?:dj|band|artist|performer)\s+for\b/i,
];

export type NameGateResult =
  | { ok: true; cleanName: string; parts?: undefined }
  | { ok: true; cleanName: string; parts: string[] } // compound: process parts
  | { ok: false; reason: string };

export type CreationDecision =
  | { action: 'reject'; reason: string }
  | { action: 'merge'; characterId: string; matchedName: string; cleanName: string }
  | { action: 'create'; cleanName: string }
  | { action: 'defer'; cleanName: string; rawName: string; candidates: Array<{ character_id: string; name: string; subtitle?: string }> };

export type ClassifyForCreationOptions = {
  context?: ResolutionContext;
};

type CharacterRow = CharacterResolutionRow;

class CharacterRegistry {
  /**
   * Per-user creation lock. Character classify→insert is check-then-insert
   * without a transaction; two extractions in one message used to race and
   * create the same person twice. Serializing per user closes that window in
   * this process; the canonical_name unique index is the cross-process
   * backstop.
   */
  private creationLocks = new Map<string, Promise<unknown>>();

  async runExclusive<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.creationLocks.get(userId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const gate = run.then(() => undefined, () => undefined);
    this.creationLocks.set(userId, gate);
    try {
      return await run;
    } finally {
      if (this.creationLocks.get(userId) === gate) this.creationLocks.delete(userId);
    }
  }

  /**
   * Clean a raw extracted name and reject junk.
   * "Dana who's handling onboarding" → "Dana"
   * "Reese the Recruiter and Dana Onboarding Contact" → parts: ["Reese", "Dana Onboarding Contact"→cleaned recursively]
   */
  gateName(raw: string): NameGateResult {
    let name = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, reason: 'empty' };

    // Strip descriptive clauses: "Dana who's handling onboarding" → "Dana"
    name = name.replace(/\s{1,40}(?:who(?:'s|’s|se)?|whom|that|which)\b.*$/i, '').trim();
    // Strip comma appositives: "Adrian Patel, My Coding Mentor" → "Adrian Patel"
    name = name.replace(/,.*$/, '').trim();
    // Strip leading articles
    name = name.replace(/^(?:the|a|an)\s+/i, '').trim();
    // Strip trailing role descriptors: "Reese the Recruiter" → "Reese",
    // "Aunt Maribel the Hallway Guardian" → "Aunt Maribel" (any case)
    name = name.replace(/\s{1,40}the\s{1,40}[\w][\w ]{0,80}$/i, '').trim();
    // Strip trailing punctuation
    name = name.replace(/[.,;:!?]{1,40}$/, '').trim();

    if (!name) return { ok: false, reason: 'empty_after_cleaning' };

    // Compound: "Reese and Dana" — two people in one mention
    const compoundParts = name.split(/\s{1,40}(?:and|&)\s{1,40}/i).map(p => p.trim()).filter(Boolean);
    if (compoundParts.length > 1 && compoundParts.every(p => /^[A-ZÀ-Ý]/.test(p))) {
      return { ok: true, cleanName: name, parts: compoundParts };
    }

    if (name.length < 2) return { ok: false, reason: 'too_short' };
    if (JUNK_NAMES.has(name.toLowerCase())) return { ok: false, reason: 'junk_word' };
    if (isCollectivePersonName(name)) return { ok: false, reason: 'collective_not_individual' };
    if (NON_PERSON_NAME_PATTERNS.some(pattern => pattern.test(name))) return { ok: false, reason: 'non_person_name' };

    const mentionKind = classifyMentionKind(name, raw);
    if (mentionKind.kind !== 'person' && mentionKind.kind !== 'unknown') {
      return { ok: false, reason: mentionKind.reason ?? mentionKind.kind };
    }

    const classification = classifyEntity(name, raw);
    if (!isCharacterEligible(classification.type) && !isUnknownEntity(classification.type)) {
      return { ok: false, reason: classification.reason };
    }

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
  async classifyForCreation(
    userId: string,
    rawName: string,
    options?: ClassifyForCreationOptions
  ): Promise<CreationDecision> {
    const gate = this.gateName(rawName);
    if (!gate.ok) return { action: 'reject', reason: gate.reason };
    const cleanName = gate.parts ? gate.parts[0] : gate.cleanName;

    const titleBuild = buildDisplayTitleFromMention('pending', { text: rawName });
    if (!shouldAllowCharacterCreation(titleBuild)) {
      return { action: 'reject', reason: 'bare_title_without_context' };
    }

    if (await this.isKnownNonPerson(userId, cleanName)) {
      return { action: 'reject', reason: 'known_location_or_org' };
    }

    if (await isUserRejectedEntityCard(userId, cleanName)) {
      return { action: 'reject', reason: 'user_deleted_entity_card' };
    }

    const authorityHit = await characterAuthorityService.resolveByName(userId, cleanName);
    if (authorityHit.characterId && authorityHit.confidence >= 0.85) {
      return {
        action: 'merge',
        characterId: authorityHit.characterId,
        matchedName: authorityHit.matchedName ?? cleanName,
        cleanName,
      };
    }

    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    const existing = (data ?? []) as CharacterRow[];

    const hasDistinctnessCue = /\b(other|another|different|second|new)\b/i.test(rawName);
    const mentionNorm = normalizeNameKey(cleanName);

    const exactMatches = existing.filter(
      c => normalizeNameKey(c.name) === mentionNorm
        || (c.alias ?? []).some(a => normalizeNameKey(a) === mentionNorm)
    );
    if (exactMatches.length >= 1 && (exactMatches.length > 1 || hasDistinctnessCue)) {
      return await this.deferWith(userId, cleanName, rawName, exactMatches);
    }

    if (isEntityResolutionCoreActive()) {
      return this.classifyWithCore(userId, cleanName, rawName, existing, hasDistinctnessCue, options?.context);
    }

    const legacyDecision = await this.classifyForCreationLegacy(userId, cleanName, rawName, existing, hasDistinctnessCue);

    if (isEntityResolutionShadowEnabled()) {
      const coreResult = resolveMention(
        cleanName,
        existing.map(characterToResolutionCandidate),
        options?.context ?? {}
      );
      const coreDecision = await this.classifyWithCore(userId, cleanName, rawName, existing, hasDistinctnessCue, options?.context);
      logCharacterCreationShadowComparison(
        compareCharacterCreationDecisions(
          cleanName,
          legacyDecision.action,
          coreDecision.action === 'reject' ? 'reject' : coreDecision.action,
          coreResult.recommendation
        )
      );
    }

    return legacyDecision;
  }

  private async classifyForCreationLegacy(
    userId: string,
    cleanName: string,
    rawName: string,
    existing: CharacterRow[],
    hasDistinctnessCue: boolean
  ): Promise<CreationDecision> {
    const mentionNorm = normalizeNameKey(cleanName);
    const mentionFirst = mentionNorm.split(' ')[0];
    const mentionHasSurname = mentionNorm.includes(' ');

    const exactMatches = existing.filter(
      c => normalizeNameKey(c.name) === mentionNorm
        || (c.alias ?? []).some(a => normalizeNameKey(a) === mentionNorm)
    );
    if (exactMatches.length === 1 && !hasDistinctnessCue) {
      const c = exactMatches[0];
      return { action: 'merge', characterId: c.id, matchedName: c.name, cleanName };
    }
    if (exactMatches.length >= 1) {
      return await this.deferWith(userId, cleanName, rawName, exactMatches);
    }

    let possessiveAmbiguity = false;
    const candidates = existing.filter(c => {
      const candNorm = normalizeNameKey(c.name);
      const candFirst = candNorm.split(' ')[0];
      const candHasSurname = candNorm.includes(' ');
      if (candFirst !== mentionFirst) {
        const distinct: string[] = (c.metadata?.distinct_from_mentions as string[] | undefined) ?? [];
        if (distinct.includes(mentionNorm)) return false;
        if (namesOverlapByContainment(mentionNorm, candNorm)) {
          if (containmentIsPossessive(candNorm, mentionNorm) || containmentIsPossessive(mentionNorm, candNorm)) {
            possessiveAmbiguity = true;
          }
          return true;
        }
        return jaroWinkler(mentionNorm, candNorm) >= 0.93;
      }
      if (mentionHasSurname && candHasSurname && candNorm !== mentionNorm) return false;
      return true;
    });

    if (candidates.length === 0) return { action: 'create', cleanName };

    if (candidates.length === 1 && !hasDistinctnessCue && !possessiveAmbiguity) {
      const cand = candidates[0];
      const candNorm = normalizeNameKey(cand.name);
      const candFirst = candNorm.split(' ')[0];
      const oneSideFirstNameOnly = !mentionHasSurname || !candNorm.includes(' ');
      const contained = namesOverlapByContainment(mentionNorm, candNorm);
      const jw = jaroWinkler(mentionNorm, candNorm);
      const bareNameInsideContextualName = !mentionHasSurname && candFirst !== mentionFirst && contained;
      if (!bareNameInsideContextualName && (oneSideFirstNameOnly || contained || jw >= 0.97)) {
        return { action: 'merge', characterId: cand.id, matchedName: cand.name, cleanName };
      }
    }

    return await this.deferWith(userId, cleanName, rawName, candidates);
  }

  private async classifyWithCore(
    userId: string,
    cleanName: string,
    rawName: string,
    existing: CharacterRow[],
    hasDistinctnessCue: boolean,
    context?: ResolutionContext
  ): Promise<CreationDecision> {
    const mentionNorm = normalizeNameKey(cleanName);
    const possessiveAmbiguity = this.detectPossessiveAmbiguity(mentionNorm, existing);

    const coreResult = resolveMention(
      cleanName,
      existing.map(characterToResolutionCandidate),
      context ?? {}
    );
    const coreAction = characterCreationActionFromCore(coreResult);

    if (coreAction === 'reject') {
      // Core skip = UNKNOWN token; creation gate already accepted this as a person mention.
      return { action: 'create', cleanName };
    }

    if (coreAction === 'create') {
      return { action: 'create', cleanName };
    }

    if (coreAction === 'merge') {
      const resolved = existing.find(c => c.id === coreResult.resolvedId);
      if (!resolved) return { action: 'create', cleanName };
      if (hasDistinctnessCue || possessiveAmbiguity) {
        return await this.deferWith(userId, cleanName, rawName, [resolved, ...existing.filter(c => c.id !== resolved.id).slice(0, 2)]);
      }
      return { action: 'merge', characterId: resolved.id, matchedName: resolved.name, cleanName };
    }

    const rankedRows = coreResult.ranked
      .map(r => existing.find(c => c.id === r.id))
      .filter((c): c is CharacterRow => Boolean(c));
    const deferCandidates = rankedRows.length > 0 ? rankedRows : existing.slice(0, 3);
    return await this.deferWith(userId, cleanName, rawName, deferCandidates);
  }

  private detectPossessiveAmbiguity(mentionNorm: string, existing: CharacterRow[]): boolean {
    const mentionFirst = mentionNorm.split(' ')[0];
    for (const c of existing) {
      const candNorm = normalizeNameKey(c.name);
      const candFirst = candNorm.split(' ')[0];
      if (candFirst === mentionFirst) continue;
      if (namesOverlapByContainment(mentionNorm, candNorm)) {
        if (containmentIsPossessive(candNorm, mentionNorm) || containmentIsPossessive(mentionNorm, candNorm)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Build a defer decision whose options carry each candidate's most
   * distinguishing fact ("manager at SpaceX") — "mentioned 3×" can't help the
   * user tell two Derriks apart.
   */
  private async deferWith(
    userId: string,
    cleanName: string,
    rawName: string,
    candidates: CharacterRow[]
  ): Promise<CreationDecision> {
    const top = candidates.slice(0, 3);
    const subtitles = await Promise.all(
      top.map(async c => {
        const { data } = await supabaseAdmin
          .from('entity_facts')
          .select('fact')
          .eq('user_id', userId)
          .eq('entity_id', c.id)
          .eq('entity_type', 'character')
          .order('confidence', { ascending: false })
          .limit(1);
        const fact = data?.[0]?.fact as string | undefined;
        if (fact) return fact.length > 60 ? `${fact.slice(0, 57)}…` : fact;
        return c.metadata?.mention_count ? `mentioned ${c.metadata.mention_count}×` : undefined;
      })
    );
    return {
      action: 'defer',
      cleanName,
      rawName,
      candidates: top.map((c, i) => ({ character_id: c.id, name: c.name, subtitle: subtitles[i] })),
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
    const alreadyKnown = normalizeNameKey(mention) === normalizeNameKey(row.name)
      || (row.alias ?? []).some(a => normalizeNameKey(a) === normalizeNameKey(mention));
    if (addAlias && !alreadyKnown && isValidAliasForCharacter(row.name, mention)) {
      aliases.add(mention);
    }

    const metadata = {
      ...(row.metadata ?? {}),
      ...(sourceMeta ?? {}),
      mention_count: ((row.metadata?.mention_count as number) ?? 0) + 1,
    };

    // Name upgrade: when the user finally uses a fuller name ("Derrik" →
    // "Derrik Halvorsen"), promote the card's primary name and demote the old
    // name to an alias so earlier mentions still match.
    const update: Record<string, unknown> = { metadata, updated_at: new Date().toISOString() };
    const mentionFirst = normalizeNameKey(mention).split(' ')[0];
    const rowFirst = normalizeNameKey(row.name).split(' ')[0];
    const mentionIsFuller = mention.includes(' ') && !row.name.includes(' ') && mentionFirst === rowFirst;
    if (addAlias && mentionIsFuller) {
      aliases.delete(mention);
      aliases.add(row.name);
      const parsedName = splitPersonName(mention);
      update.name = mention;
      update.first_name = parsedName.firstName || null;
      update.last_name = parsedName.lastName || null;
      logger.info({ characterId, from: row.name, to: mention }, 'Character name upgraded to fuller form');
    }
    update.alias = aliases.size > 0 ? filterValidAliases(row.name, [...aliases]) : null;

    await supabaseAdmin
      .from('characters')
      .update(update)
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
    threadId?: string | null,
    rawText?: string
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
      raw_text: rawText ?? null,
    });
    logger.info({ userId, mention, candidateCount: candidates.length }, 'Entity question queued for chat');
  }

  /**
   * Pop the next pending question for delivery in a chat response.
   * Anti-spam: max one per response (caller invokes once), each question is
   * asked at most twice (then silently dismissed), and resolved/dismissed
   * questions are permanent memory.
   *
   * Only delivers when the current message actually references the mention —
   * stale questions from ingestion must not attach to unrelated chat turns.
   */
  async takeNextPendingQuestion(
    userId: string,
    context?: {
      message?: string;
      threadId?: string;
      conversationHistory?: Array<{ role: string; content: string }>;
    }
  ): Promise<{
    question_id: string;
    mention_text: string;
    candidates: Array<{ character_id: string; name: string; subtitle?: string }>;
  } | null> {
    const { data } = await supabaseAdmin
      .from('entity_questions')
      .select('id, mention_text, candidates, asked_count, thread_id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    for (const q of data ?? []) {
      if ((q.asked_count as number) >= 2) {
        await supabaseAdmin
          .from('entity_questions')
          .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
          .eq('id', q.id);
        continue;
      }

      const mentionText = q.mention_text as string;
      const questionThreadId = q.thread_id as string | null;

      // Global questions (no thread) must never interrupt an unrelated chat thread.
      if (!questionThreadId) continue;

      if (context?.threadId && questionThreadId !== context.threadId) continue;

      // The USER must have brought up this name earlier in THIS thread — assistant
      // mentions from RAG/hallucination must not trigger a "who did you mean?" prompt.
      if (
        !threadUserHistoryReferencesMention(
          context?.conversationHistory,
          context?.message,
          mentionText
        )
      ) {
        continue;
      }

      let candidates = ((q.candidates as DisambiguationCandidate[]) ?? []).map((c) => ({
        character_id: c.character_id ?? c.entity_id ?? '',
        name: c.name,
        subtitle: c.subtitle,
      })).filter((c) => c.character_id);

      const ids = candidates.map((c) => c.character_id);
      let characterRows: CharacterRow[] = [];
      if (ids.length > 0) {
        const { data: chars } = await supabaseAdmin
          .from('characters')
          .select('id, name, alias')
          .eq('user_id', userId)
          .in('id', ids);
        characterRows = (chars ?? []) as CharacterRow[];
      }

      candidates = normalizeDisambiguationCandidates(candidates, characterRows);

      if (candidates.length <= 1) {
        await supabaseAdmin
          .from('entity_questions')
          .update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolution: { action: 'auto_dismissed_not_ambiguous' } })
          .eq('id', q.id);
        logger.debug({ userId, mention: mentionText, candidateCount: candidates.length }, 'Auto-dismissed non-ambiguous entity question');
        continue;
      }

      await supabaseAdmin
        .from('entity_questions')
        .update({ asked_count: (q.asked_count as number) + 1 })
        .eq('id', q.id);

      return {
        question_id: q.id as string,
        mention_text: mentionText,
        candidates,
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
      .select('id, mention_text, candidates, status, raw_text')
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
      // Mention is (also) a new person. If a candidate shares the name, derive
      // a distinguishing display name from the raw clause the gate stripped:
      // "Derrik the other manager that worked at SpaceX" → "Derrik (SpaceX)".
      // The bare mention stays as an alias so it still matches this card.
      const sameNameExists = ((q.candidates as any[]) ?? []).some(
        c => (c.name as string).toLowerCase().split(' ')[0] === mention.toLowerCase().split(' ')[0]
      );
      const displayName = sameNameExists ? this.qualifiedName(mention, (q.raw_text as string | null) ?? mention) : mention;

      const { v4: uuid } = await import('uuid');
      const { assignCharacterAvatar } = await import('./characterAvatarService');
      createdCharacterId = uuid();
      const avatarUrl = await assignCharacterAvatar(createdCharacterId);
      await supabaseAdmin.from('characters').insert({
        id: createdCharacterId,
        user_id: userId,
        name: displayName,
        alias: displayName !== mention ? [mention] : null,
        status: 'active',
        tags: [],
        importance_level: 'minor',
        relationship_depth: 'mentioned_only',
        avatar_url: avatarUrl,
        metadata: { generated_by: 'user_clarification', generated_at: now, mention_count: 1 },
      });
      void identityLedgerService.recordMutation({
        userId,
        entityId: createdCharacterId,
        entityType: 'character',
        mutationType: 'ENTITY_CREATED',
        newValue: { name: displayName, aliases: displayName !== mention ? [mention] : [] },
        reason: 'Created from user clarification',
        source: 'USER',
      });
    }
    // "Not the same person" memory — but only for materially different names
    // ("Kel" ≠ Dana). For same-first-name people the ambiguity is real on
    // every future mention and must be asked/context-resolved, not blanket-
    // excluded, or every later "Derrik" story silently routes to one Derrik.
    const rejectedIds = candidateIds.filter(id => !selected.includes(id));
    if (answer.createNew && rejectedIds.length > 0) {
      const mentionFirst = mention.toLowerCase().split(' ')[0];
      const differentNameIds = ((q.candidates as any[]) ?? [])
        .filter(c => rejectedIds.includes(c.character_id) && (c.name as string).toLowerCase().split(' ')[0] !== mentionFirst)
        .map(c => c.character_id as string);
      if (differentNameIds.length > 0) {
        await this.recordDistinctFrom(userId, mention, differentNameIds);
      }
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
   * Derive a display name that distinguishes a same-name person, using the
   * clause the name gate stripped: prefer a capitalized token (org/place,
   * "SpaceX"), fall back to a role word ("manager").
   */
  private qualifiedName(mention: string, rawText: string): string {
    const idx = rawText.toLowerCase().indexOf(mention.toLowerCase());
    const clause = idx >= 0 ? rawText.slice(idx + mention.length) : rawText;
    const capToken = clause.match(/\b([A-Z][\w-]{2,})\b/)?.[1];
    const role = clause.match(/\b(manager|recruiter|boss|coach|teacher|professor|doctor|therapist|coworker|colleague|neighbor|roommate|barista|trainer|landlord|mentor)\b/i)?.[1]?.toLowerCase();
    const qualifier = capToken ?? role;
    return qualifier ? `${mention} (${qualifier})` : mention;
  }

  /**
   * "New person" answers stamp distinct_from_mentions on the rejected
   * candidates so this mention never matches them again.
   */
  async recordDistinctFrom(userId: string, mention: string, characterIds: string[]): Promise<void> {
    const mentionLower = normalizeNameKey(mention);
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
      void identityLedgerService.recordMutation({
        userId,
        entityId: id,
        entityType: 'character',
        mutationType: 'MERGE_REJECTED',
        newValue: { distinct_from_mention: mentionLower },
        reason: `User confirmed "${mention}" is a different person`,
        source: 'USER',
      });
    }
  }
}

export const characterRegistry = new CharacterRegistry();
