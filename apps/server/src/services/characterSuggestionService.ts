/**
 * Character suggestion service — surfaces people detected in chat/journal
 * who are NOT yet in the Characters book.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isIndividualPersonName } from '../utils/personNameValidation';
import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { collectNameKeys, resolveBookNameMatch, type BookNameEntry, type BookNameEntryWithId } from '../utils/suggestionBookFilter';
import { characterSuggestionId } from '../utils/entitySuggestionId';
import type { AlternativeCategory } from './suggestionCrossBookService';
import { enrichSuggestionsWithParserAlternatives } from './lorebook/parser/loreBookSuggestionEnricher';
import {
  buildEntityQualityContext,
  filterQualityCandidates,
  gateSuggestionCandidate,
} from './lorebook/quality/entityQualityGateService';
import { suggestionDismissalService } from './suggestionDismissalService';
import { supabaseAdmin } from './supabaseClient';

export type CharacterSuggestion = {
  id: string;
  name: string;
  omegaEntityId?: string;
  questionId?: string;
  archetype?: string;
  role?: string;
  relationship?: string;
  context?: string;
  mentionCount: number;
  confidence: number;
  source: 'omega_entity' | 'entity_question' | 'chat_extract';
  match_status?: 'new' | 'similar' | 'existing';
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  alternative_categories?: AlternativeCategory[];
};

export type CharacterSuggestionContext = 'general' | 'romantic';

const JUNK = new Set(['me', 'myself', 'you', 'i', 'we', 'they', 'someone', 'somebody']);

const ROMANTIC_KEYWORDS = [
  'girlfriend', 'boyfriend', 'my partner', 'fiancé', 'fiancee', 'dating', 'dated',
  'romantic', 'situationship', 'hooked up', 'hooking up', 'slept with', 'slept together',
  'made out', 'went on a date', 'went out with', 'our date', 'friends with benefits',
  'my ex', 'ex girlfriend', 'ex boyfriend', 'crush on', 'in love', 'love him', 'love her',
  'seeing someone', 'talking to', 'situationship',
];

class CharacterSuggestionService {
  async getSuggestions(
    userId: string,
    options?: { context?: CharacterSuggestionContext }
  ): Promise<CharacterSuggestion[]> {
    const context = options?.context ?? 'general';
    const qualityCtx = await buildEntityQualityContext(userId);
    const suggestions = await this.collectSuggestions(userId, qualityCtx);
    const visible = await suggestionDismissalService.filterNames(
      userId,
      'characters',
      context === 'romantic'
        ? await this.filterRomanticSuggestions(userId, suggestions, qualityCtx)
        : suggestions,
      (s) => s.name
    );
    const gated = filterQualityCandidates('characters', visible, {
      ...qualityCtx,
      getEvidence: (s) => s.context,
    });
    return enrichSuggestionsWithParserAlternatives(userId, 'characters', gated, (s) => s.name, (s) => s.context);
  }

  private async collectSuggestions(
    userId: string,
    qualityCtx: Awaited<ReturnType<typeof buildEntityQualityContext>>
  ): Promise<CharacterSuggestion[]> {
    const suggestions: CharacterSuggestion[] = [];
    const seen = new Set<string>();

    let bookExact = new Set<string>();
    let bookEntries: BookNameEntryWithId[] = [];

    const add = (s: Omit<CharacterSuggestion, 'id' | 'match_status' | 'matched_book_id' | 'matched_book_name'>) => {
      const gated = gateSuggestionCandidate(s.name, 'characters', s.context ?? '', qualityCtx);
      if (!gated) return;
      const safeName = gated.name;
      const key = normalizeNameKey(safeName);
      if (!key || key.length < 2 || JUNK.has(key) || seen.has(key)) return;
      if (!isIndividualPersonName(safeName)) return;
      if (classifyMentionKind(safeName).kind !== 'person') return;
      const match = resolveBookNameMatch(safeName, bookExact, bookEntries);
      if (match.status === 'existing') return;
      seen.add(key);
      suggestions.push({
        ...s,
        name: safeName,
        id: characterSuggestionId({ ...s, name: safeName }),
        match_status: match.status,
        matched_book_id: match.matchedId ?? null,
        matched_book_name: match.matchedName ?? null,
      });
    };

    try {
      const [{ data: characters }, { data: omegaEntities }, { data: questions }, { data: indexRows }, { data: authorityRows }] =
        await Promise.all([
          supabaseAdmin
            .from('characters')
            .select('id, name, alias, metadata, status')
            .eq('user_id', userId)
            .limit(500),
          supabaseAdmin
            .from('omega_entities')
            .select('id, primary_name, mention_count, mention_status, metadata')
            .eq('user_id', userId)
            .in('type', ['PERSON', 'CHARACTER'])
            .eq('mention_status', 'mentioned_only')
            .gte('mention_count', 1)
            .order('mention_count', { ascending: false })
            .limit(40),
          supabaseAdmin
            .from('entity_questions')
            .select('id, mention_text, candidates, created_at')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(20),
          supabaseAdmin
            .from('character_identity_index')
            .select('mention, character_id')
            .eq('user_id', userId)
            .limit(1000),
          supabaseAdmin
            .from('character_authority_map')
            .select('source_id, source_table')
            .eq('user_id', userId)
            .eq('source_table', 'omega_entities'),
        ]);

      const linkedOmegaIds = new Set<string>(
        (authorityRows ?? []).map((row) => String(row.source_id ?? '')).filter(Boolean)
      );

      const bookCharacterIds = new Set<string>();
      const allNames: string[] = [];
      const bookRows: Array<{ id: string; names: string[] }> = [];

      for (const c of characters ?? []) {
        const meta = (c.metadata as Record<string, unknown>) ?? {};
        if (meta.is_self || meta.is_user) continue;
        if (c.status === 'archived') continue;
        bookCharacterIds.add(c.id);
        const omegaEntityId = typeof meta.omega_entity_id === 'string' ? meta.omega_entity_id : '';
        if (omegaEntityId) linkedOmegaIds.add(omegaEntityId);
        const aliases = Array.isArray(c.alias)
          ? c.alias.filter((a): a is string => typeof a === 'string')
          : [];
        allNames.push(c.name, ...aliases);
        bookRows.push({ id: c.id, names: [c.name, ...aliases] });
      }

      for (const row of indexRows ?? []) {
        if (bookCharacterIds.has(row.character_id) && typeof row.mention === 'string') {
          allNames.push(row.mention);
          const owner = bookRows.find((b) => b.id === row.character_id);
          if (owner) owner.names.push(row.mention);
        }
      }

      const book = collectNameKeys(allNames);
      bookExact = book.exactKeys;
      bookEntries = bookRows.flatMap((row) =>
        row.names.map((label) => ({
          norm: normalizeNameKey(label),
          label: label.trim(),
          id: row.id,
        }))
      ).filter((e) => e.norm.length >= 2);

      for (const row of indexRows ?? []) {
        const mention = String(row.mention ?? '').trim();
        const linkedId = row.character_id;
        if (!mention || !linkedId || bookCharacterIds.has(linkedId)) continue;
        if (resolveBookNameMatch(mention, bookExact, bookEntries).status !== 'new') continue;
        add({
          name: mention,
          mentionCount: 2,
          confidence: 0.84,
          source: 'chat_extract',
          context: 'Previously in your Character Book — add to restore their card and knowledge links',
        });
      }

      for (const e of omegaEntities ?? []) {
        if (linkedOmegaIds.has(e.id)) continue;
        if (resolveBookNameMatch(e.primary_name, bookExact, bookEntries).status === 'existing') continue;
        const meta = (e.metadata as Record<string, unknown> | null) ?? {};
        add({
          name: e.primary_name,
          omegaEntityId: e.id,
          mentionCount: Number(e.mention_count ?? 0),
          confidence: Math.min(0.9, 0.5 + Number(e.mention_count ?? 0) * 0.06),
          source: 'omega_entity',
          archetype: typeof meta.archetype === 'string' ? meta.archetype : undefined,
          relationship: typeof meta.relationship_type === 'string' ? meta.relationship_type : undefined,
          context: 'Mentioned repeatedly in your conversations',
        });
      }

      for (const q of questions ?? []) {
        const mention = String(q.mention_text ?? '').trim();
        if (!mention || resolveBookNameMatch(mention, bookExact, bookEntries).status === 'existing') continue;

        const candidates = (q.candidates as Array<{ character_id?: string; name?: string }>) ?? [];
        const candidateInBook = candidates.some(
          cand => cand.character_id && bookCharacterIds.has(cand.character_id)
        );
        if (candidateInBook) continue;

        add({
          name: mention,
          questionId: q.id,
          mentionCount: 1,
          confidence: 0.75,
          source: 'entity_question',
          context: 'LoreBook needs your help confirming who this is',
        });
      }

      const combined = await this.loadRecentText(userId);
      if (combined.length > 20) {
        const extracted = await this.extractNamesFromText(combined);
        for (const name of extracted) {
          if (resolveBookNameMatch(name, bookExact, bookEntries).status === 'existing') continue;
          add({
            name,
            mentionCount: 2,
            confidence: 0.68,
            source: 'chat_extract',
            context: 'Detected in your recent chats',
          });
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Character suggestions failed');
    }

    return suggestions
      .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
      .slice(0, 12);
  }

  private async filterRomanticSuggestions(
    userId: string,
    suggestions: CharacterSuggestion[],
    qualityCtx: Awaited<ReturnType<typeof buildEntityQualityContext>>
  ): Promise<CharacterSuggestion[]> {
    const [romanticFromChat, fromRelationships] = await Promise.all([
      this.extractRomanticIndividualsFromRecentText(userId, qualityCtx),
      this.suggestionsFromRomanticRelationships(userId, qualityCtx),
    ]);
    const merged = new Map<string, CharacterSuggestion>();

    for (const s of [...suggestions, ...romanticFromChat, ...fromRelationships]) {
      if (!this.looksRomanticSuggestion(s)) continue;
      const key = normalizeNameKey(s.name);
      const existing = merged.get(key);
      if (!existing || s.confidence > existing.confidence) {
        merged.set(key, {
          ...s,
          id: s.id ?? characterSuggestionId(s),
          archetype: s.archetype ?? 'romantic',
          context: s.context ?? 'Possible romantic connection from your chats',
        });
      }
    }

    return [...merged.values()]
      .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
      .slice(0, 12);
  }

  private looksRomanticSuggestion(s: CharacterSuggestion): boolean {
    if (s.archetype === 'romantic' || s.archetype === 'past_romantic') return true;
    if (s.relationship === 'romantic') return true;
    const blob = `${s.role ?? ''} ${s.context ?? ''}`.toLowerCase();
    return ROMANTIC_KEYWORDS.some((kw) => blob.includes(kw));
  }

  private async extractRomanticIndividualsFromRecentText(
    userId: string,
    qualityCtx: Awaited<ReturnType<typeof buildEntityQualityContext>>
  ): Promise<CharacterSuggestion[]> {
    const text = await this.loadRecentText(userId);
    if (text.length < 20) return [];

    const { characterRegistry } = await import('./characterRegistry');
    const lower = text.toLowerCase();
    const hasRomanticSignal = ROMANTIC_KEYWORDS.some((kw) => lower.includes(kw));
    if (!hasRomanticSignal) return [];

    const names = await this.extractNamesFromText(text);
    const out: CharacterSuggestion[] = [];

    for (const name of names) {
      if (!isIndividualPersonName(name)) continue;
      const gate = characterRegistry.gateName(name);
      if (!gate.ok) continue;

      const nameLower = name.toLowerCase();
      const idx = lower.indexOf(nameLower);
      const window = idx >= 0
        ? lower.slice(Math.max(0, idx - 80), Math.min(lower.length, idx + nameLower.length + 80))
        : lower;
      const romanticNearby = ROMANTIC_KEYWORDS.some((kw) => window.includes(kw));
      if (!romanticNearby) continue;

      const gated = gateSuggestionCandidate(
        gate.cleanName,
        'characters',
        'Mentioned near romantic language in your chats',
        qualityCtx
      );
      if (!gated) continue;

      out.push({
        id: characterSuggestionId({ name: gated.name }),
        name: gated.name,
        mentionCount: 2,
        confidence: 0.72,
        source: 'chat_extract',
        archetype: 'romantic',
        relationship: 'romantic',
        context: 'Mentioned near romantic language in your chats',
      });
    }

    return out;
  }

  private async suggestionsFromRomanticRelationships(
    userId: string,
    qualityCtx: Awaited<ReturnType<typeof buildEntityQualityContext>>
  ): Promise<CharacterSuggestion[]> {
    const { data: relationships } = await supabaseAdmin
      .from('romantic_relationships')
      .select('person_id, person_type, relationship_type, metadata')
      .eq('user_id', userId)
      .limit(40);

    if (!relationships?.length) return [];

    const characterIds = relationships
      .filter((r) => r.person_type === 'character')
      .map((r) => r.person_id);
    const entityIds = relationships
      .filter((r) => r.person_type === 'omega_entity')
      .map((r) => r.person_id);

    const [{ data: characters }, { data: entities }, { data: bookChars }] = await Promise.all([
      characterIds.length
        ? supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).in('id', characterIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      entityIds.length
        ? supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', entityIds)
        : Promise.resolve({ data: [] as { id: string; primary_name: string }[] }),
      supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId).limit(500),
    ]);

    const book = collectNameKeys(
      (bookChars ?? []).flatMap((c) => [c.name, ...((c.alias as string[] | null) ?? [])])
    );

    const out: CharacterSuggestion[] = [];
    for (const rel of relationships) {
      const name =
        rel.person_type === 'character'
          ? characters?.find((c) => c.id === rel.person_id)?.name
          : entities?.find((e) => e.id === rel.person_id)?.primary_name;
      if (!name || !isIndividualPersonName(name)) continue;
      if (resolveBookNameMatch(name, book.exactKeys, book.entries).status === 'existing') continue;
      const gated = gateSuggestionCandidate(
        name,
        'characters',
        `Tracked as ${String(rel.relationship_type).replace(/_/g, ' ')} — add to your Character Book`,
        qualityCtx
      );
      if (!gated) continue;
      out.push({
        id: characterSuggestionId({
          name: gated.name,
          omegaEntityId: rel.person_type === 'omega_entity' ? rel.person_id : undefined,
        }),
        name: gated.name,
        mentionCount: 2,
        confidence: 0.78,
        source: 'chat_extract',
        archetype: 'romantic',
        relationship: 'romantic',
        context: `Tracked as ${String(rel.relationship_type).replace(/_/g, ' ')} — add to your Character Book`,
      });
    }
    return out;
  }

  private async loadRecentText(userId: string): Promise<string> {
    const [messagesRes, entriesRes] = await Promise.all([
      supabaseAdmin
        .from('chat_messages')
        .select('content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(40),
      supabaseAdmin
        .from('journal_entries')
        .select('content')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(20),
    ]);

    return [
      ...((messagesRes.data ?? []) as Array<{ content: string }>).map(m => m.content),
      ...((entriesRes.data ?? []) as Array<{ content: string }>).map(e => e.content),
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 8000);
  }

  private async extractNamesFromText(text: string): Promise<string[]> {
    const { characterRegistry } = await import('./characterRegistry');
    const names = new Set<string>();

    const patterns = [
      /\b(?:my|our|with|from|met|saw|called|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|\s+said|\s+told|\s+and)\b/g,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const raw = match[1]?.trim();
        if (!raw || !isIndividualPersonName(raw)) continue;
        const gate = characterRegistry.gateName(raw);
        if (gate.ok) names.add(gate.cleanName);
      }
    }

    return [...names].slice(0, 8);
  }
}

export const characterSuggestionService = new CharacterSuggestionService();
