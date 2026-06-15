/**
 * Location suggestion service — places mentioned in chat/journal not yet in Places book.
 */

import { logger } from '../logger';
import {
  extractNamedPlacesFromText,
  filterRedundantPlaceSuggestions,
  placeClusterKey,
  pickBestPlaceName,
} from '../utils/namedPlaceExtractor';
import { normalizeNameKey } from '../utils/nameNormalization';
import { collectNameKeys, isNameAlreadyInBook, type BookNameEntry } from '../utils/suggestionBookFilter';
import { locationSuggestionId } from '../utils/entitySuggestionId';
import { locationService } from './locationService';
import { locationNicknameService } from './locationNicknameService';
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
};

class LocationSuggestionService {
  private async buildLocationBookIndex(userId: string): Promise<{ exactKeys: Set<string>; entries: BookNameEntry[] }> {
    const allNames: string[] = [];

    const [profiles, { data: canonical }, { data: peoplePlaces }] = await Promise.all([
      locationService.listLocations(userId),
      supabaseAdmin.from('locations').select('name, normalized_name, metadata').eq('user_id', userId),
      supabaseAdmin
        .from('people_places')
        .select('name, type')
        .eq('user_id', userId)
        .in('type', ['place', 'location']),
    ]);

    for (const p of profiles) {
      allNames.push(p.name);
    }

    for (const loc of canonical ?? []) {
      allNames.push(loc.name);
      if (typeof loc.normalized_name === 'string' && loc.normalized_name.trim()) {
        allNames.push(loc.normalized_name);
      }
      const aliases = (loc.metadata as Record<string, unknown> | null)?.aliases;
      if (Array.isArray(aliases)) {
        for (const alias of aliases) {
          if (typeof alias === 'string') allNames.push(alias);
        }
      }
    }

    for (const pp of peoplePlaces ?? []) {
      if (typeof pp.name === 'string') allNames.push(pp.name);
    }

    return collectNameKeys(allNames);
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

  async getSuggestions(userId: string): Promise<LocationSuggestion[]> {
    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    const { exactKeys: bookExact, entries: bookEntries } = await this.buildLocationBookIndex(userId);

    const add = (s: Omit<LocationSuggestion, 'id'>) => {
      const key = normalizeNameKey(s.name);
      if (!key || key.length < 2 || seen.has(key)) return;
      if (isNameAlreadyInBook(s.name, bookExact, bookEntries)) return;
      seen.add(key);
      suggestions.push({ ...s, id: locationSuggestionId(s) });
    };

    try {
      const combined = await this.loadRecentText(userId);
      if (combined.trim()) {
        // Phase 1: named / anchor places from raw text (Abuela's House, Costco)
        const named = extractNamedPlacesFromText(combined);
        for (const place of named) {
          add({
            name: place.name,
            type: place.type,
            description: place.context,
            context: place.context,
            mentionCount: place.mentionCount,
            confidence: place.isNamed ? 0.88 : 0.72,
            source: 'chat_detect',
          });
        }

        // Phase 2: only truly unnamed places — one line at a time to avoid cross-message noise
        const lines = combined.split(/\n+/).map(l => l.trim()).filter(l => l.length > 12);
        for (const line of lines.slice(0, 30)) {
          const unnamed = await locationNicknameService.detectAndGenerateNicknames(userId, line, [], {
            suggestionsMode: true,
          });
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

    return filterRedundantPlaceSuggestions(this.consolidateSuggestions(suggestions))
      .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
      .slice(0, 12);
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
