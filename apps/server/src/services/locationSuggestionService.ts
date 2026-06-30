/**
 * Location suggestion service — places mentioned in chat/journal not yet in Places book.
 */

import { isOpenAiCircuitOpen } from '../lib/openaiCircuitBreaker';
import { logger } from '../logger';
import { processPlaceSuggestionsFromCorpus } from './lexical/places/placeSuggestionService';
import { materializeSpatialEvents } from './events/spatialEventMaterializer';
import {
  filterRedundantPlaceSuggestions,
  placeClusterKey,
  pickBestPlaceName,
} from '../utils/namedPlaceExtractor';
import { normalizeNameKey } from '../utils/nameNormalization';
import { collectNameKeys, resolveBookNameMatch, type BookNameEntryWithId } from '../utils/suggestionBookFilter';
import { locationSuggestionId } from '../utils/entitySuggestionId';
import { locationService } from './locationService';
import { locationNicknameService } from './locationNicknameService';
import { collectPlaceNamesFromIntelligence } from './lexical/intelligence/episodeLexicalScanner';
import { enrichSuggestionsWithParserAlternatives } from './lorebook/parser/loreBookSuggestionEnricher';
import {
  buildEntityQualityContext,
  filterQualityCandidates,
  gateSuggestionCandidate,
} from './lorebook/quality/entityQualityGateService';
import type { AlternativeCategory } from './suggestionCrossBookService';
import { suggestionDismissalService } from './suggestionDismissalService';
import { entityLearningService } from './entityLearningService';
import { supabaseAdmin } from './supabaseClient';

export type LocationSuggestion = {
  id: string;
  name: string;
  type?: string;
  context?: string;
  description?: string;
  associatedWith?: string[];
  mentionCount: number;
  confidence: number;
  source: 'chat_detect' | 'metadata';
  status?: 'known' | 'new' | 'needs_review' | 'rejected';
  privacySensitive?: boolean;
  ownerDisplayName?: string;
  rejectionReason?: string;
  match_status?: 'new' | 'similar' | 'existing';
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  alternative_categories?: AlternativeCategory[];
};

class LocationSuggestionService {
  private async buildLocationBookIndex(userId: string): Promise<{
    exactKeys: Set<string>;
    entries: BookNameEntryWithId[];
  }> {
    const allNames: string[] = [];
    const bookRows: Array<{ id?: string; names: string[] }> = [];

    const [profiles, { data: canonical }, { data: peoplePlaces }] = await Promise.all([
      locationService.listLocations(userId),
      supabaseAdmin.from('locations').select('id, name, normalized_name, metadata').eq('user_id', userId),
      supabaseAdmin
        .from('people_places')
        .select('id, name, type')
        .eq('user_id', userId)
        .in('type', ['place', 'location']),
    ]);

    for (const p of profiles) {
      allNames.push(p.name);
      bookRows.push({ id: p.id, names: [p.name] });
    }

    for (const loc of canonical ?? []) {
      const names = [loc.name];
      if (typeof loc.normalized_name === 'string' && loc.normalized_name.trim()) {
        names.push(loc.normalized_name);
      }
      const aliases = (loc.metadata as Record<string, unknown> | null)?.aliases;
      if (Array.isArray(aliases)) {
        for (const alias of aliases) {
          if (typeof alias === 'string') names.push(alias);
        }
      }
      allNames.push(...names);
      bookRows.push({ id: loc.id, names });
    }

    for (const pp of peoplePlaces ?? []) {
      if (typeof pp.name === 'string') {
        allNames.push(pp.name);
        bookRows.push({ id: pp.id, names: [pp.name] });
      }
    }

    const learning = await entityLearningService.getUserLearningContext(userId);
    for (const learned of learning.aliasesByDomain.values()) {
      if (learned.domain !== 'locations') continue;
      if (!learned.canonicalEntityId || !learned.aliases.length) continue;
      const names = [learned.canonicalName, ...learned.aliases].filter((name): name is string => Boolean(name?.trim()));
      if (names.length === 0) continue;
      allNames.push(...names);
      bookRows.push({ id: learned.canonicalEntityId, names });
    }

    const { exactKeys } = collectNameKeys(allNames);
    const entries: BookNameEntryWithId[] = bookRows.flatMap((row) =>
      row.names.map((label) => ({
        norm: normalizeNameKey(label),
        label: label.trim(),
        id: row.id,
      }))
    ).filter((e) => e.norm.length >= 2);

    return { exactKeys, entries };
  }

  private consolidateSuggestions(suggestions: LocationSuggestion[]): LocationSuggestion[] {
    const groups = new Map<string, LocationSuggestion[]>();
    for (const s of suggestions) {
      const key = placeClusterKey(s.name, s.type);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    return [...groups.values()].map(group => {
      const bestName = pickBestPlaceName(group.map(g => g.name));
      const primary = group.find(g => g.name === bestName) ?? group[0];
      return {
        ...primary,
        id: locationSuggestionId({ name: bestName, type: primary.type }),
        name: bestName,
        mentionCount: group.reduce((sum, g) => sum + g.mentionCount, 0),
        confidence: Math.max(...group.map(g => g.confidence)),
        context: group.map(g => g.context).filter(Boolean).slice(0, 2).join(' · '),
      };
    });
  }

  async getSuggestions(
    userId: string,
    options?: { skipAi?: boolean; rescan?: boolean }
  ): Promise<LocationSuggestion[]> {
    const qualityCtx = await buildEntityQualityContext(userId);
    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    const { exactKeys: bookExact, entries: bookEntries } = await this.buildLocationBookIndex(userId);
    const knownPlaces = new Set<string>([...bookExact, ...bookEntries.map((e) => e.label)]);

    const add = (s: Omit<LocationSuggestion, 'id' | 'match_status' | 'matched_book_id' | 'matched_book_name'>) => {
      if (s.status === 'rejected') return;
      const evidence = s.context ?? s.description ?? '';
      const gated = gateSuggestionCandidate(s.name, 'locations', evidence, {
        ...qualityCtx,
        knownInBook: knownPlaces,
      });
      if (!gated) return;

      const safeName = gated.name;
      const key = normalizeNameKey(safeName);
      if (!key || key.length < 2 || seen.has(key)) return;
      const match = resolveBookNameMatch(safeName, bookExact, bookEntries);
      if (match.status === 'existing') return;
      seen.add(key);

      const needsReview =
        gated.verdict.requiresReview ||
        gated.verdict.gate === 'review' ||
        s.status === 'needs_review' ||
        s.privacySensitive;

      suggestions.push({
        ...s,
        name: safeName,
        id: locationSuggestionId({ ...s, name: safeName }),
        match_status: match.status,
        matched_book_id: match.matchedId ?? null,
        matched_book_name: match.matchedName ?? null,
        status: needsReview ? 'needs_review' : s.status,
        privacySensitive:
          s.privacySensitive ||
          gated.verdict.rejectionReason === 'private_residence' ||
          gated.verdict.rejectionReason === 'exact_street_address',
      });
    };

    try {
      const combined = await this.loadRecentText(userId);
      if (combined.trim()) {
        // Phase 1: boundary-aware place pipeline (replaces raw namedPlaceExtractor)
        const lines = combined.split(/\n+/).map(l => l.trim()).filter(Boolean);
        const bounded = processPlaceSuggestionsFromCorpus(lines, { knownPlaces });
        for (const place of bounded) {
          add({
            name: place.text,
            type: place.placeType,
            description: place.evidencePhrases[0],
            context: place.evidencePhrases[0],
            mentionCount: 1,
            confidence: place.confidence,
            source: 'chat_detect',
            status: place.status,
            privacySensitive: place.privacySensitive,
            ownerDisplayName: place.ownerDisplayName,
          });
        }

        // Candidates the place guard reclassified as events ("Ink Fest",
        // "Ink's Ska Prom") become real Event cards instead of being dropped.
        // Deduped + idempotent; gated to deliberate rescans so it isn't a side
        // effect of every suggestion fetch.
        if (options?.rescan) {
          const eventRefs = bounded
            .filter((p) => p.status === 'rejected' && (p.rejectedAs === 'EVENT' || p.rejectedAs === 'MUSIC_EVENT'))
            .map((p) => ({ name: p.text, evidence: p.evidencePhrases[0] }));
          if (eventRefs.length > 0) {
            void materializeSpatialEvents(userId, eventRefs).catch((err) =>
              logger.debug({ err, userId }, 'spatial event materialization failed'),
            );
          }
        }

        // Phase 1b: lexical intelligence place spans
        for (const line of lines) {
          if (line.length < 6) continue;
          for (const placeName of collectPlaceNamesFromIntelligence(line, userId)) {
            add({
              name: placeName,
              type: 'place',
              context: line.slice(0, 120),
              mentionCount: 1,
              confidence: 0.68,
              source: 'chat_detect',
              status: 'new',
            });
          }
        }

        // Phase 2: AI for unnamed places — skip when circuit open or explicitly disabled
        const skipAi = options?.skipAi === true || isOpenAiCircuitOpen();
        if (!skipAi) {
          const lines = combined.split(/\n+/).map(l => l.trim()).filter(l => l.length > 12);
          for (const line of lines.slice(0, 5)) {
            const unnamed = await locationNicknameService.detectAndGenerateNicknames(userId, line, [], {
              suggestionsMode: true,
            });
            if (isOpenAiCircuitOpen()) break;
            for (const loc of unnamed) {
              add({
                name: loc.name,
                type: loc.type,
                description: loc.description,
                context: loc.context,
                associatedWith: loc.associatedWith,
                mentionCount: 1,
                confidence: 0.62,
                source: 'chat_detect',
              });
            }
          }
        }
      }

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('metadata')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(40);

      for (const entry of entries ?? []) {
        const meta = (entry.metadata as Record<string, unknown>) ?? {};
        for (const field of ['location', 'place', 'city', 'venue']) {
          const val = meta[field];
          if (typeof val === 'string' && val.trim().length > 1) {
            add({
              name: val.trim(),
              type: field,
              mentionCount: 1,
              confidence: 0.6,
              source: 'metadata',
              context: 'Tagged in a journal entry',
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Location suggestions failed');
    }

    const filtered = await suggestionDismissalService.filterNames(
      userId,
      'locations',
      filterRedundantPlaceSuggestions(this.consolidateSuggestions(suggestions))
        .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
        .slice(0, 12),
      (s) => s.name
    );

    const gated = filterQualityCandidates('locations', filtered, {
      ...qualityCtx,
      knownInBook: knownPlaces,
      getEvidence: (s) => s.context ?? s.description,
      enrich: (item, verdict) => ({
        ...item,
        status:
          verdict.requiresReview || verdict.gate === 'review' || item.status === 'needs_review'
            ? 'needs_review'
            : item.status,
        privacySensitive:
          item.privacySensitive ||
          verdict.rejectionReason === 'private_residence' ||
          verdict.rejectionReason === 'exact_street_address',
      }),
    });

    return enrichSuggestionsWithParserAlternatives(
      userId,
      'locations',
      gated,
      (s) => s.name,
      (s) => s.context ?? s.description
    );
  }

  /** Force a full corpus rescan with lexical intelligence + place pipeline. */
  async rescanFromCorpus(userId: string): Promise<LocationSuggestion[]> {
    return this.getSuggestions(userId, { rescan: true, skipAi: isOpenAiCircuitOpen() });
  }

  async acceptSuggestion(
    userId: string,
    suggestion: {
      name: string;
      type?: string;
      context?: string;
      description?: string;
      associatedWith?: string[];
    }
  ): Promise<{ id: string; name: string }> {
    const created = await locationNicknameService.createLocationWithNickname(userId, {
      name: suggestion.name,
      type: suggestion.type,
      context: suggestion.context ?? 'Added from Places suggestion',
      description: suggestion.description,
      associatedWith: suggestion.associatedWith,
      isNickname: false,
    });
    if (!created) {
      throw new Error('Could not save place — it may already exist under a similar name');
    }
    return created;
  }

  private async loadRecentText(userId: string): Promise<string> {
    const [messagesRes, entriesRes] = await Promise.all([
      supabaseAdmin
        .from('chat_messages')
        .select('content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(50),
      supabaseAdmin
        .from('journal_entries')
        .select('content')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(25),
    ]);

    return [
      ...((messagesRes.data ?? []) as Array<{ content: string }>).map(m => m.content),
      ...((entriesRes.data ?? []) as Array<{ content: string }>).map(e => e.content),
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 9000);
  }
}

export const locationSuggestionService = new LocationSuggestionService();
