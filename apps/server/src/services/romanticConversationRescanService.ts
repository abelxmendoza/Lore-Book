/**
 * Full-story romantic relationship rescan — replays chat + journal through
 * lexical romantic intelligence and upserts Dating & Romance records.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import {
  hasRomanticSignals,
  parseRomanticEpisode,
  summarizeRomanticCorpus,
  type RomanticLexicalHit,
} from './ontology/romanticIntelligence';
import {
  applyRomanticLexicalHit,
  resolveRomanticPartner,
} from './romanticLexicalIngestionService';
import { ingestRelationshipPeripheralsFromMessage } from './relationshipPeripheralService';
import { hasVicariousRelationshipSignals } from './ontology/vicariousRelationshipIntelligence';
import { supabaseAdmin } from './supabaseClient';

export type RomanticRescanSummary = {
  scannedEpisodes: number;
  romanticEpisodes: number;
  partnersDiscovered: number;
  relationshipsUpserted: number;
  interactionsLogged: number;
  peripheralsUpserted: number;
  glossaryCuesMatched: number;
  partnerNames: string[];
  lexicalHits: RomanticLexicalHit[];
};

type EpisodeRow = { source: 'journal' | 'chat'; id: string; text: string };

class RomanticConversationRescanService {
  private async loadEpisodes(userId: string, limit = 2000): Promise<EpisodeRow[]> {
    const [journals, chats] = await Promise.all([
      supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .order('date', { ascending: true })
        .limit(limit),
      supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
        .limit(limit),
    ]);

    const episodes: EpisodeRow[] = [];
    for (const j of journals.data ?? []) {
      if (typeof j.content === 'string' && j.content.trim()) {
        episodes.push({ source: 'journal', id: j.id, text: j.content });
      }
    }
    for (const c of chats.data ?? []) {
      if (typeof c.content === 'string' && c.content.trim()) {
        episodes.push({ source: 'chat', id: c.id, text: c.content });
      }
    }
    return episodes;
  }

  async rescan(userId: string): Promise<RomanticRescanSummary> {
    const episodes = await this.loadEpisodes(userId);
    const romanticEpisodes = episodes.filter((e) => hasRomanticSignals(e.text));
    const corpus = summarizeRomanticCorpus(episodes.map((e) => e.text));

    const hitByPartner = new Map<string, RomanticLexicalHit & { episodeId?: string }>();
    for (const episode of romanticEpisodes) {
      for (const hit of parseRomanticEpisode(episode.text)) {
        if (hit.confidence < 0.65) continue;
        const key = normalizeNameKey(hit.partnerName);
        const prev = hitByPartner.get(key);
        if (!prev || hit.confidence > prev.confidence) {
          hitByPartner.set(key, { ...hit, episodeId: episode.id });
        }
      }
    }

    let relationshipsUpserted = 0;
    let interactionsLogged = 0;
    let peripheralsUpserted = 0;
    const partnerNames: string[] = [];

    for (const hit of hitByPartner.values()) {
      const partner = await resolveRomanticPartner(userId, hit.partnerName);
      if (!partner) continue;

      partnerNames.push(partner.name);

      const applied = await applyRomanticLexicalHit(userId, hit, hit.episodeId, partner);
      if (applied) {
        relationshipsUpserted += 1;
        interactionsLogged += 1;
      }
    }

    for (const episode of episodes) {
      if (!hasVicariousRelationshipSignals(episode.text)) continue;
      const result = await ingestRelationshipPeripheralsFromMessage(
        userId,
        episode.text,
        episode.id,
        partnerNames
      );
      peripheralsUpserted += result.saved;
    }

    try {
      const { romanticRelationshipScoring } = await import(
        './conversationCentered/romanticRelationshipScoring'
      );
      await romanticRelationshipScoring.scoreAllForUser(userId);
    } catch (err) {
      logger.debug({ err, userId }, 'Romantic scoring after rescan failed (non-blocking)');
    }

    const summary: RomanticRescanSummary = {
      scannedEpisodes: episodes.length,
      romanticEpisodes: romanticEpisodes.length,
      partnersDiscovered: hitByPartner.size,
      relationshipsUpserted,
      interactionsLogged,
      peripheralsUpserted,
      glossaryCuesMatched: corpus.glossaryCues.length,
      partnerNames: [...new Set(partnerNames)].sort((a, b) => a.localeCompare(b)),
      lexicalHits: corpus.hits.slice(0, 50),
    };

    logger.info({ userId, summary: { ...summary, lexicalHits: summary.lexicalHits.length } }, 'Romantic conversation rescan completed');
    return summary;
  }
}

export const romanticConversationRescanService = new RomanticConversationRescanService();
