/**
 * Full-story character rescan — replays chat + journal episodes through lexical
 * intelligence and promotes people into the Characters book with authority links.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { isIndividualPersonName } from '../utils/personNameValidation';
import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { classifyEntity, isCharacterEligible, isUnknownEntity } from './entities/entityClassifier';
import { characterFoundationService } from './characterFoundationService';
import { characterIdentityIndexService } from './characterIdentityIndexService';
import { characterAuthorityService } from './characterAuthorityService';
import { characterRestoreService } from './characterRestoreService';
import { selfCharacterService } from './selfCharacterService';
import { discoverEntities } from './ontology/lexicalIntelligence';
import { collectPersonNamesFromIntelligence } from './lexical/intelligence/episodeLexicalScanner';
import { extractLexicalEntities } from './lexical/lexicalEntityExtractor';
import { expandEntityCandidates } from './kinship/multiEntitySplitter';
import { extractKinshipMentions } from './kinship/kinshipGlossary';
import { omegaMemoryService } from './omegaMemoryService';
import { supabaseAdmin } from './supabaseClient';
import type { EntityType } from '../types/omegaMemory';

export type CharacterRescanSummary = {
  scannedEpisodes: number;
  personsDiscovered: number;
  omegaResolved: number;
  charactersPromoted: number;
  charactersSkipped: number;
  restoredFromEvidence: number;
  promotedNames: string[];
};

type EpisodeRow = { source: 'journal' | 'chat'; id: string; text: string };

const JUNK = new Set(['me', 'myself', 'you', 'i', 'we', 'they', 'someone', 'somebody', 'the', 'a', 'an']);

function collectPersonMentions(text: string, userId?: string): string[] {
  const names = new Set<string>();
  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeNameKey(name);
    if (!name || key.length < 2 || JUNK.has(key)) return;
    if (!isIndividualPersonName(name)) return;
    if (classifyMentionKind(name).kind !== 'person') return;
    const classification = classifyEntity(name, text);
    if (!isCharacterEligible(classification.type) && !isUnknownEntity(classification.type)) return;
    names.add(name);
  };

  for (const name of collectPersonNamesFromIntelligence(text, userId)) {
    add(name);
  }

  for (const discovered of discoverEntities(text)) {
    if (discovered.domain === 'PERSON') add(discovered.name);
  }

  for (const lexical of extractLexicalEntities(text)) {
    if (lexical.type === 'PERSON' || lexical.type === 'IDENTITY_CLAIM') add(lexical.surface);
  }

  for (const kin of extractKinshipMentions(text)) {
    add(kin.sourcePhrase);
  }

  const properNounPattern = /\b([A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+){0,3})\b/g;
  let match: RegExpExecArray | null;
  const baseCandidates: Array<{ name: string; type: EntityType }> = [];
  while ((match = properNounPattern.exec(text)) !== null) {
    baseCandidates.push({ name: match[1].trim(), type: 'PERSON' });
  }

  for (const expanded of expandEntityCandidates(text, baseCandidates)) {
    if (expanded.type === 'PERSON' || expanded.type === 'CHARACTER') add(expanded.name);
  }

  return Array.from(names);
}

class CharacterConversationRescanService {
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

  async rescan(userId: string): Promise<CharacterRescanSummary> {
    await selfCharacterService.repairSelfCharacterIdentity(userId);

    const episodes = await this.loadEpisodes(userId);
    const mentionCounts = new Map<string, number>();

    for (const episode of episodes) {
      for (const name of collectPersonMentions(episode.text, userId)) {
        const key = normalizeNameKey(name);
        mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
      }
    }

    const ranked = [...mentionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 250)
      .map(([key]) => {
        for (const episode of episodes) {
          for (const name of collectPersonMentions(episode.text, userId)) {
            if (normalizeNameKey(name) === key) return name;
          }
        }
        return key;
      });

    const candidates = ranked.map((name) => ({
      name,
      type: 'PERSON' as EntityType,
    }));

    let omegaResolved = 0;
    let charactersPromoted = 0;
    let charactersSkipped = 0;
    const promotedNames: string[] = [];

    if (candidates.length > 0) {
      const resolved = await omegaMemoryService.resolveEntities(userId, candidates);
      omegaResolved = resolved.length;

      for (const entity of resolved) {
        if (entity.type !== 'PERSON' && entity.type !== 'CHARACTER') continue;
        const characterId = await characterFoundationService.promoteOmegaEntityToCharacter(
          userId,
          {
            id: entity.id,
            primary_name: entity.primary_name,
            type: entity.type,
            aliases: entity.aliases,
            mention_count: mentionCounts.get(normalizeNameKey(entity.primary_name)) ?? 1,
          },
          null,
          { forcePromote: true }
        );
        if (characterId) {
          charactersPromoted += 1;
          promotedNames.push(entity.primary_name);
        } else {
          charactersSkipped += 1;
        }
      }
    }

    const restoreReport = await characterRestoreService.restoreAllCharacters(userId);

    const { data: archivedCharacters } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId)
      .eq('status', 'archived');
    let reactivatedArchived = 0;
    for (const row of archivedCharacters ?? []) {
      const keys = [normalizeNameKey(row.name), ...((row.alias as string[] | null) ?? []).map(normalizeNameKey)];
      if (keys.some((key) => key && mentionCounts.has(key))) {
        await supabaseAdmin
          .from('characters')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('user_id', userId);
        reactivatedArchived += 1;
      }
    }

    await characterIdentityIndexService.rebuild(userId);
    await characterAuthorityService.seedAuthorityLinks(userId);

    try {
      const { backfillEntityConversationLinksForUser } = await import(
        './conversationCentered/entityConversationBackfillService'
      );
      await backfillEntityConversationLinksForUser(userId);
    } catch (err) {
      logger.debug({ err, userId }, 'Conversation link backfill after rescan failed (non-blocking)');
    }

    try {
      const { publicFigureRelationshipService } = await import('./publicFigure/publicFigureRelationshipService');
      await publicFigureRelationshipService.inferForUser(userId);
      const { socialStandingService } = await import('./socialStandingService');
      await socialStandingService.recompute(userId);
    } catch (err) {
      logger.warn({ err, userId }, 'Public figure relationship inference after rescan failed (non-blocking)');
    }

    const summary: CharacterRescanSummary = {
      scannedEpisodes: episodes.length,
      personsDiscovered: mentionCounts.size,
      omegaResolved,
      charactersPromoted,
      charactersSkipped,
      restoredFromEvidence: Math.max(0, restoreReport.afterCount - restoreReport.beforeCount) + reactivatedArchived,
      promotedNames: [...new Set(promotedNames)].sort((a, b) => a.localeCompare(b)),
    };

    logger.info({ userId, summary }, 'Character conversation rescan completed');
    return summary;
  }

  async hasCompletedRescan(userId: string): Promise<boolean> {
    const { count } = await supabaseAdmin
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('metadata->>generated_by', 'chat_extraction');
    return (count ?? 0) >= 5;
  }
}

export const characterConversationRescanService = new CharacterConversationRescanService();
