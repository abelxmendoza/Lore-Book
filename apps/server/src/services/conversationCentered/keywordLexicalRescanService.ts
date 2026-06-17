/**
 * Keyword-group lexical rescan — scan all chat + journal text for a set of
 * keywords, run deterministic lexical intelligence, and surface corrections.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { discoverEntities, type DiscoveredEntity } from '../ontology/lexicalIntelligence';
import { lookupKeyword } from '../ontology/glossary';
import { extractLexicalEntities } from '../lexical/lexicalEntityExtractor';
import { characterFoundationService } from '../characterFoundationService';
import { omegaMemoryService } from '../omegaMemoryService';
import { characterRestoreService } from '../characterRestoreService';
import type { EntityType } from '../../types/omegaMemory';

export type KeywordRescanHit = {
  keyword: string;
  source: 'chat' | 'journal';
  sourceId: string;
  sessionId?: string;
  role?: string;
  excerpt: string;
  discoveredEntities: DiscoveredEntity[];
  glossaryMatches: Array<{ term: string; category: string; subcategory?: string; confidence: number }>;
};

export type KeywordRescanSummary = {
  keywords: string[];
  scannedMessages: number;
  scannedJournals: number;
  hitCount: number;
  hits: KeywordRescanHit[];
  personsDiscovered: number;
  charactersPromoted: number;
  charactersSkipped: number;
  restoredFromEvidence: number;
};

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'a', 'an']);

function normalizeKeywords(raw: string[]): string[] {
  const out = new Set<string>();
  for (const k of raw) {
    const trimmed = (k ?? '').trim().toLowerCase();
    if (trimmed.length < 2 || STOP.has(trimmed)) continue;
    out.add(trimmed);
  }
  return [...out];
}

function excerptAround(text: string, term: string, radius = 100): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function glossaryHits(text: string, keywords: string[]): KeywordRescanHit['glossaryMatches'] {
  const matches: KeywordRescanHit['glossaryMatches'] = [];
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const entry = lookupKeyword(kw);
    if (entry) {
      matches.push({
        term: kw,
        category: entry.category,
        subcategory: entry.subcategory,
        confidence: entry.confidence ?? 0.8,
      });
      continue;
    }
    if (lower.includes(kw)) {
      const tokens = lower.split(/\s+/);
      for (const token of tokens) {
        const e = lookupKeyword(token.replace(/[^a-zà-ÿ0-9'-]/gi, ''));
        if (e && keywords.some((k) => token.includes(k) || k.includes(token))) {
          matches.push({
            term: token,
            category: e.category,
            subcategory: e.subcategory,
            confidence: e.confidence ?? 0.7,
          });
        }
      }
    }
  }
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.term}:${m.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textMatchesKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw));
}

type Episode = {
  source: 'chat' | 'journal';
  id: string;
  sessionId?: string;
  role?: string;
  text: string;
};

class KeywordLexicalRescanService {
  private async loadEpisodes(userId: string, limit = 10_000): Promise<Episode[]> {
    const [journals, chats] = await Promise.all([
      supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(limit),
      supabaseAdmin
        .from('chat_messages')
        .select('id, content, role, session_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit),
    ]);

    const episodes: Episode[] = [];
    for (const j of journals.data ?? []) {
      if (typeof j.content === 'string' && j.content.trim()) {
        episodes.push({ source: 'journal', id: j.id, text: j.content });
      }
    }
    for (const c of chats.data ?? []) {
      if (typeof c.content === 'string' && c.content.trim()) {
        episodes.push({
          source: 'chat',
          id: c.id,
          sessionId: c.session_id ?? undefined,
          role: c.role ?? undefined,
          text: c.content,
        });
      }
    }
    return episodes;
  }

  async rescan(
    userId: string,
    rawKeywords: string[],
    opts: { promote?: boolean; limit?: number } = {}
  ): Promise<KeywordRescanSummary> {
    const keywords = normalizeKeywords(rawKeywords);
    const hitLimit = Math.min(opts.limit ?? 200, 500);
    const promote = opts.promote !== false;

    if (keywords.length === 0) {
      return {
        keywords: [],
        scannedMessages: 0,
        scannedJournals: 0,
        hitCount: 0,
        hits: [],
        personsDiscovered: 0,
        charactersPromoted: 0,
        charactersSkipped: 0,
        restoredFromEvidence: 0,
      };
    }

    const episodes = await this.loadEpisodes(userId);
    const scannedMessages = episodes.filter((e) => e.source === 'chat').length;
    const scannedJournals = episodes.filter((e) => e.source === 'journal').length;
    const hits: KeywordRescanHit[] = [];
    const personNames = new Map<string, number>();

    for (const episode of episodes) {
      const matched = textMatchesKeywords(episode.text, keywords);
      if (matched.length === 0) continue;

      const discovered = discoverEntities(episode.text);
      const lexical = extractLexicalEntities(episode.text);
      const glossaryMatches = glossaryHits(episode.text, keywords);

      for (const kw of matched) {
        if (hits.length >= hitLimit) break;
        hits.push({
          keyword: kw,
          source: episode.source,
          sourceId: episode.id,
          sessionId: episode.sessionId,
          role: episode.role,
          excerpt: excerptAround(episode.text, kw),
          discoveredEntities: discovered,
          glossaryMatches,
        });
      }

      for (const d of discovered) {
        if (d.domain === 'PERSON') {
          const key = normalizeNameKey(d.name);
          personNames.set(key, (personNames.get(key) ?? 0) + 1);
        }
      }
      for (const lx of lexical) {
        if (lx.type === 'PERSON' || lx.type === 'IDENTITY_CLAIM') {
          const key = normalizeNameKey(lx.surface);
          personNames.set(key, (personNames.get(key) ?? 0) + 1);
        }
      }
    }

    let charactersPromoted = 0;
    let charactersSkipped = 0;
    let restoredFromEvidence = 0;

    if (promote && personNames.size > 0) {
      const candidates = [...personNames.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([key]) => {
          for (const hit of hits) {
            for (const d of hit.discoveredEntities) {
              if (d.domain === 'PERSON' && normalizeNameKey(d.name) === key) {
                return { name: d.name, type: 'PERSON' as EntityType };
              }
            }
          }
          return { name: key, type: 'PERSON' as EntityType };
        });

      const resolved = await omegaMemoryService.resolveEntities(userId, candidates);
      for (const entity of resolved) {
        if (entity.type !== 'PERSON' && entity.type !== 'CHARACTER') continue;
        const characterId = await characterFoundationService.promoteOmegaEntityToCharacter(
          userId,
          {
            id: entity.id,
            primary_name: entity.primary_name,
            type: entity.type,
            aliases: entity.aliases,
            mention_count: personNames.get(normalizeNameKey(entity.primary_name)) ?? 1,
          },
          null,
          { forcePromote: true }
        );
        if (characterId) charactersPromoted += 1;
        else charactersSkipped += 1;
      }

      const restoreReport = await characterRestoreService.restoreAllCharacters(userId);
      restoredFromEvidence = Math.max(0, restoreReport.afterCount - restoreReport.beforeCount);
    }

    const summary: KeywordRescanSummary = {
      keywords,
      scannedMessages,
      scannedJournals,
      hitCount: hits.length,
      hits,
      personsDiscovered: personNames.size,
      charactersPromoted,
      charactersSkipped,
      restoredFromEvidence,
    };

    logger.info({ userId, keywordCount: keywords.length, hitCount: hits.length }, 'Keyword lexical rescan completed');
    return summary;
  }
}

export const keywordLexicalRescanService = new KeywordLexicalRescanService();
