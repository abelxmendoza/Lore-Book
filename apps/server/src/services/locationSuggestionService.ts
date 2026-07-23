/**
 * Location suggestion service — places mentioned in chat/journal not yet in Places book.
 */

import { isOpenAiCircuitOpen } from '../lib/openaiCircuitBreaker';
import { logger } from '../logger';
import { processPlaceSuggestionsFromCorpus } from './lexical/places/placeSuggestionService';
import { materializeSpatialEvents } from './events/spatialEventMaterializer';
import { materializeVenueAreas } from './locations/spatialVenueAreaMaterializer';
import {
  slangPlaceAliasBinder,
  type MediaRef,
  type SourceRef,
} from './locations/inference/slangPlaceAliasBinder';
import {
  parseBareKinshipResidence,
  resolveKinshipOwner,
  type KinshipOwnerResolution,
} from './locations/inference/kinshipOwnerResolver';
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
import {
  placeCognitionEngine,
  shouldSurfacePlaceSuggestion,
  type PlaceCognitionResult,
} from './place';

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
      supabaseAdmin.from('locations').select('id, name, normalized_name, metadata, aliases').eq('user_id', userId),
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
      // Aliases live in BOTH the aliases column (slang binder, merges) and
      // metadata.aliases (legacy) — read both so known names always match.
      const aliasLists = [
        (loc as { aliases?: unknown }).aliases,
        (loc.metadata as Record<string, unknown> | null)?.aliases,
      ];
      for (const list of aliasLists) {
        if (!Array.isArray(list)) continue;
        for (const alias of list) {
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

  /**
   * Place Cognition Engine v2 — normalize/reject candidates before they enter
   * the suggestion book. Mentions stay mentions; fragments and narration die here.
   */
  private applyPlaceCognition(
    draft: Omit<LocationSuggestion, 'id' | 'match_status' | 'matched_book_id' | 'matched_book_name'>,
    knownPlaceNames: string[],
  ): (Omit<LocationSuggestion, 'id' | 'match_status' | 'matched_book_id' | 'matched_book_name'> & {
    cognition?: PlaceCognitionResult;
  }) | null {
    const result = placeCognitionEngine.evaluate({
      span: draft.name,
      evidenceText: draft.context ?? draft.description,
      sourceType: draft.source === 'metadata' ? 'metadata' : 'chat',
      proposedType: draft.type,
      proposedConfidence: draft.confidence,
      knownPlaceNames,
    });

    if (!shouldSurfacePlaceSuggestion(result)) {
      return null;
    }
    // Generic worksite references stay off the Places suggestion rail.
    if (result.decision === 'HOLD_GENERIC') {
      return null;
    }

    return {
      ...draft,
      name: result.canonicalTitle,
      type: result.subtype ?? draft.type,
      description: result.description ?? undefined,
      // Never dump whole evidence paragraphs into context once cognition rewrote it.
      context:
        result.description
        ?? (draft.context && draft.context.length <= 180 ? draft.context : undefined),
      confidence: result.confidence,
      status:
        result.decision === 'MERGE_EXISTING'
          ? 'known'
          : result.status === 'needs_review'
            ? 'needs_review'
            : draft.status === 'needs_review'
              ? 'needs_review'
              : result.status,
      rejectionReason: result.rejectionReason,
      cognition: result,
    };
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

    const knownPlaceNameList = [
      ...bookEntries.map((e) => e.label),
      ...[...bookExact],
    ];

    const add = (s: Omit<LocationSuggestion, 'id' | 'match_status' | 'matched_book_id' | 'matched_book_name'>) => {
      if (s.status === 'rejected') return;
      const cognized = this.applyPlaceCognition(s, knownPlaceNameList);
      if (!cognized) return;
      // Canonical already in book → absorb as alias, do not resurface.
      if (cognized.cognition?.decision === 'MERGE_EXISTING') return;

      const evidence = cognized.context ?? cognized.description ?? '';
      const gated = gateSuggestionCandidate(cognized.name, 'locations', evidence, {
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

      const { cognition: _cognition, ...cognizedSuggestion } = cognized;
      const needsReview =
        gated.verdict.requiresReview ||
        gated.verdict.gate === 'review' ||
        cognizedSuggestion.status === 'needs_review' ||
        cognizedSuggestion.privacySensitive;

      suggestions.push({
        ...cognizedSuggestion,
        name: safeName,
        id: locationSuggestionId({ ...cognizedSuggestion, name: safeName }),
        match_status: match.status,
        matched_book_id: match.matchedId ?? null,
        matched_book_name: match.matchedName ?? null,
        status: needsReview ? 'needs_review' : cognizedSuggestion.status,
        privacySensitive:
          cognizedSuggestion.privacySensitive ||
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
          // Unresolved venue references ("that venue", "Security Kickout Venue") get
          // linked to the event they share an evidence line with — never a Place.
          const unresolvedVenues = bounded
            .filter((p) => p.status === 'rejected' && p.rejectedAs === 'UNRESOLVED_LOCATION')
            .map((p) => ({ name: p.text, evidence: p.evidencePhrases[0] }));
          if (eventRefs.length > 0 || unresolvedVenues.length > 0) {
            void materializeSpatialEvents(userId, eventRefs, { unresolvedVenues }).catch((err) =>
              logger.debug({ err, userId }, 'spatial event materialization failed'),
            );
          }

          // Slang place cards created before the alias layer existed
          // ("Weeb City" as a standalone Place) fold into the lore entity they
          // refer to; entry photos (X posts) attach to mentioned cards.
          void slangPlaceAliasBinder
            .reconcileExistingSlangPlaceCards(userId)
            .catch((err) => logger.debug({ err, userId }, 'slang place reconciliation failed'));
          void this.loadRecentEntryIndex(userId)
            .then((idx) => slangPlaceAliasBinder.attachEntryMedia(userId, idx))
            .catch((err) => logger.debug({ err, userId }, 'entry media attachment failed'));

          // Venue sub-areas ("the pit at Bad Dogg Compound") become nested
          // locations under their parent venue when it's already known.
          const areaRefs = bounded
            .filter((p) => p.status === 'rejected' && p.rejectedAs === 'VENUE_AREA')
            .map((p) => ({ name: p.text, evidence: p.evidencePhrases[0] }));
          if (areaRefs.length > 0) {
            void materializeVenueAreas(userId, areaRefs).catch((err) =>
              logger.debug({ err, userId }, 'venue-area materialization failed'),
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

    // Bare kinship-title residences ("Tia's House") must bind to a NAMED
    // relative: one family-tree match renames the suggestion ("Tía Grace's
    // House"); zero or several go to review with the candidates listed.
    const kinResolved = await this.resolveBareKinshipOwners(userId, gated, bookExact, bookEntries);

    // Slang toponyms ("Weeb City") that resolve to existing lore — as a known
    // alias or via theme + temporal inference — bind to that entity (with
    // source provenance and any tweet photos) instead of surfacing as new
    // Place suggestions.
    const unresolved = await this.bindSlangAliases(userId, kinResolved);

    return enrichSuggestionsWithParserAlternatives(
      userId,
      'locations',
      unresolved,
      (s) => s.name,
      (s) => s.context ?? s.description
    );
  }

  /**
   * "Tia's House" is a title, not a name — resolve WHICH tía against the
   * user's Characters. Exactly one named match binds the place to her; zero
   * or several surface for review with the options listed, never a guess.
   */
  private async resolveBareKinshipOwners(
    userId: string,
    suggestions: LocationSuggestion[],
    bookExact: Set<string>,
    bookEntries: BookNameEntryWithId[],
  ): Promise<LocationSuggestion[]> {
    if (!suggestions.some((s) => parseBareKinshipResidence(s.name))) return suggestions;

    const out: LocationSuggestion[] = [];
    const cache = new Map<string, KinshipOwnerResolution>();

    for (const s of suggestions) {
      const kin = parseBareKinshipResidence(s.name);
      if (!kin) {
        out.push(s);
        continue;
      }

      const cacheKey = normalizeNameKey(kin.title);
      let resolution = cache.get(cacheKey);
      if (!resolution) {
        resolution = await resolveKinshipOwner(userId, kin.title).catch(
          (): KinshipOwnerResolution => ({ status: 'unknown' }),
        );
        cache.set(cacheKey, resolution);
      }

      if (resolution.status === 'resolved') {
        const label = kin.placeLabel.charAt(0).toUpperCase() + kin.placeLabel.slice(1).toLowerCase();
        const newName = `${resolution.ownerName}'s ${label}`;
        const match = resolveBookNameMatch(newName, bookExact, bookEntries);
        if (match.status === 'existing') continue; // already a card under the named owner
        out.push({
          ...s,
          name: newName,
          id: locationSuggestionId({ name: newName, type: s.type }),
          associatedWith: [...new Set([...(s.associatedWith ?? []), resolution.ownerName])],
          context: [s.context, `Matched to ${resolution.ownerName} from your family tree`]
            .filter(Boolean)
            .join(' · '),
          match_status: match.status,
          matched_book_id: match.matchedId ?? null,
          matched_book_name: match.matchedName ?? null,
        });
        continue;
      }

      const note =
        resolution.status === 'ambiguous'
          ? `Which ${kin.title}? Your Characters have: ${resolution.candidates.join(', ')}`
          : `No named ${kin.title} found in your Characters — kinship titles need a name`;
      out.push({
        ...s,
        status: 'needs_review',
        context: [s.context, note].filter(Boolean).join(' · '),
      });
    }

    return out;
  }

  private async bindSlangAliases(
    userId: string,
    suggestions: LocationSuggestion[],
  ): Promise<LocationSuggestion[]> {
    if (suggestions.length === 0) return suggestions;
    try {
      const entryIndex = await this.loadRecentEntryIndex(userId);
      const findSourceEntry = (s: LocationSuggestion) => {
        const nameKey = normalizeNameKey(s.name);
        return entryIndex.find((e) => normalizeNameKey(e.content).includes(nameKey));
      };

      const items = suggestions.map((s) => {
        const entry = findSourceEntry(s);
        return {
          name: s.name,
          evidence: s.context ?? s.description,
          sourceDate: entry?.date,
          sourceRef: entry?.sourceRef,
          media: entry?.media,
        };
      });

      const results = await slangPlaceAliasBinder.resolveMany(userId, items);
      return suggestions.filter((s) => !results.get(normalizeNameKey(s.name))?.bound);
    } catch (err) {
      logger.debug({ err, userId }, 'slang alias binding failed; keeping suggestions as-is');
      return suggestions;
    }
  }

  /**
   * Recent journal entries with their source refs (tweet URL for X-synced
   * entries) and any attached media, so slang/alias mentions carry provenance
   * and photos to the card they bind to.
   */
  private async loadRecentEntryIndex(userId: string): Promise<
    Array<{ id: string; content: string; date?: string; sourceRef?: SourceRef; media: MediaRef[] }>
  > {
    const { data } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date, source, metadata')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(40);

    return ((data ?? []) as Array<{
      id: string;
      content: string | null;
      date: string | null;
      source: string | null;
      metadata: Record<string, unknown> | null;
    }>).map((row) => {
      const meta = row.metadata ?? {};
      const isX = row.source === 'x' || typeof meta.x_post_id === 'string';
      const sourceRef: SourceRef | undefined = isX
        ? {
            source: 'x_post',
            url: typeof meta.x_url === 'string' ? meta.x_url : undefined,
            entryId: row.id,
            excerpt: row.content?.slice(0, 240),
            at: row.date ?? undefined,
          }
        : { source: 'journal', entryId: row.id, excerpt: row.content?.slice(0, 240), at: row.date ?? undefined };

      const media: MediaRef[] = Array.isArray(meta.x_media)
        ? (meta.x_media as Array<Record<string, unknown>>)
            .filter((m) => typeof m?.url === 'string')
            .map((m) => ({
              url: String(m.url),
              type: (m.type as MediaRef['type']) ?? 'photo',
              alt: typeof m.alt_text === 'string' ? m.alt_text : undefined,
              source: 'x_post' as const,
              sourceUrl: typeof meta.x_url === 'string' ? meta.x_url : undefined,
              entryId: row.id,
              capturedAt: row.date ?? undefined,
            }))
        : [];

      return { id: row.id, content: row.content ?? '', date: row.date ?? undefined, sourceRef, media };
    });
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
    const { exactKeys, entries } = await this.buildLocationBookIndex(userId);
    const cognition = placeCognitionEngine.evaluate({
      span: suggestion.name,
      evidenceText: suggestion.context ?? suggestion.description,
      sourceType: 'chat',
      proposedType: suggestion.type,
      knownPlaceNames: [...entries.map((e) => e.label), ...exactKeys],
      userConfirmed: true,
    });

    if (cognition.decision === 'REJECT' || cognition.entityKind === 'SYNTHETIC_NARRATION') {
      throw new Error(
        cognition.rejectionReason === 'synthetic_narration'
          ? 'That suggestion is generated narration, not a place'
          : 'That suggestion is not a valid place',
      );
    }
    if (cognition.decision === 'HOLD_GENERIC') {
      throw new Error('That location is too generic to save as a Place yet — add a more specific name');
    }
    if (cognition.decision === 'ROUTE_EVENT') {
      throw new Error('That looks like an event, not a place — add it from Events instead');
    }

    const created = await locationNicknameService.createLocationWithNickname(userId, {
      name: cognition.canonicalTitle || suggestion.name,
      type: cognition.subtype ?? suggestion.type,
      context: suggestion.context ?? 'Added from Places suggestion',
      description: cognition.description ?? suggestion.description,
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
