/**
 * Full-story character rescan — replays chat + journal episodes through lexical
 * intelligence and promotes people into the Characters book with authority links.
 */

import { logger } from '../logger';
import { characterInferenceService } from './characters/inference/characterInferenceService';
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
import { characterRescanStateService } from './characters/audit/characterRescanStateService';
import { characterCardRescanAuditService } from './characters/audit/characterCardRescanAuditService';
import { isUserRejectedEntityCard } from './entityRejectionRegistry';
import type { EntityType } from '../types/omegaMemory';

export type CharacterRescanSummary = {
  scannedEpisodes: number;
  incremental: boolean;
  targetedSourceRescan?: boolean;
  skippedKnownPersons: number;
  personsDiscovered: number;
  omegaResolved: number;
  charactersPromoted: number;
  charactersSkipped: number;
  restoredFromEvidence: number;
  promotedNames: string[];
  sourceMessageIds?: string[];
  cardCleanup?: {
    applied: number;
    skipped: number;
    actions: Array<{ currentTitle: string; applied: string; targetTitle?: string }>;
  };
  cardAudit?: {
    autoRemoved: number;
    queuedForReview: number;
    deletedAfterThreeStrikes: number;
    reviewSuggestions: Array<{
      characterId: string;
      name: string;
      status: string;
      reason: string;
      suggestedTitle?: string;
      reviewRound: number;
      maxRounds: number;
    }>;
  };
};

type EpisodeRow = { source: 'journal' | 'chat'; id: string; text: string; at: string };

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
  private async loadEpisodes(userId: string, limit = 2000, since?: string | null): Promise<EpisodeRow[]> {
    let journalQuery = supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(limit);
    let chatQuery = supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (since) {
      journalQuery = journalQuery.gt('date', since);
      chatQuery = chatQuery.gt('created_at', since);
    }

    const [journals, chats] = await Promise.all([journalQuery, chatQuery]);

    const episodes: EpisodeRow[] = [];
    for (const j of journals.data ?? []) {
      if (typeof j.content === 'string' && j.content.trim()) {
        episodes.push({ source: 'journal', id: j.id, text: j.content, at: String(j.date) });
      }
    }
    for (const c of chats.data ?? []) {
      if (typeof c.content === 'string' && c.content.trim()) {
        episodes.push({ source: 'chat', id: c.id, text: c.content, at: String(c.created_at) });
      }
    }
    return episodes;
  }

  private async loadEpisodesByMessageIds(userId: string, messageIds: string[]): Promise<EpisodeRow[]> {
    const uniqueIds = [...new Set(messageIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const episodes: EpisodeRow[] = [];

    const { data: chatRows } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, role')
      .eq('user_id', userId)
      .in('id', uniqueIds);

    for (const row of chatRows ?? []) {
      if (row.role !== 'user') continue;
      if (typeof row.content === 'string' && row.content.trim()) {
        episodes.push({
          source: 'chat',
          id: row.id,
          text: row.content,
          at: String(row.created_at),
        });
      }
    }

    const { data: journalRows } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date, source_message_id, metadata')
      .eq('user_id', userId)
      .in('source_message_id', uniqueIds);

    for (const row of journalRows ?? []) {
      if (typeof row.content === 'string' && row.content.trim()) {
        episodes.push({
          source: 'journal',
          id: row.id,
          text: row.content,
          at: String(row.date),
        });
      }
    }

    for (const messageId of uniqueIds) {
      if (episodes.some((e) => e.id === messageId)) continue;
      const { data: byMeta } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, date, metadata')
        .eq('user_id', userId)
        .contains('metadata', { chat_message_id: messageId })
        .limit(5);
      for (const row of byMeta ?? []) {
        if (typeof row.content === 'string' && row.content.trim()) {
          episodes.push({
            source: 'journal',
            id: row.id,
            text: row.content,
            at: String(row.date),
          });
        }
      }
    }

    return episodes;
  }

  private async promotePersonsFromEpisodes(
    userId: string,
    episodes: EpisodeRow[],
    knownPersonKeys: Set<string>,
  ): Promise<{
    mentionCounts: Map<string, number>;
    omegaResolved: number;
    charactersPromoted: number;
    charactersSkipped: number;
    promotedNames: string[];
  }> {
    const mentionCounts = new Map<string, number>();
    const displayNameByKey = new Map<string, string>();

    const inferenceByKey = new Map<string, { displayName: string; mentionCount: number; promotable: boolean }>();

    for (const episode of episodes) {
      const inference = characterInferenceService.inferFromMessage({
        text: episode.text,
        sourceMessageId: episode.id,
        authorRole: 'user',
      });
      for (const candidate of inference.accepted) {
        const key = normalizeNameKey(candidate.displayName);
        if (knownPersonKeys.has(key)) continue;
        if (await isUserRejectedEntityCard(userId, candidate.displayName)) continue;

        const prev = inferenceByKey.get(key);
        const mentionCount = (prev?.mentionCount ?? 0) + 1;
        const promotable = characterInferenceService.canPromote(candidate, { mentionCount });
        inferenceByKey.set(key, {
          displayName: candidate.displayName,
          mentionCount,
          promotable: promotable || (prev?.promotable ?? false),
        });
        mentionCounts.set(key, mentionCount);
        if (!displayNameByKey.has(key)) displayNameByKey.set(key, candidate.displayName);
      }

      // Legacy lexical mentions still contribute counts but respect inference gate on promote
      for (const name of collectPersonMentions(episode.text, userId)) {
        const key = normalizeNameKey(name);
        if (knownPersonKeys.has(key)) continue;
        if (inferenceByKey.has(key)) continue;
        if (await isUserRejectedEntityCard(userId, name)) continue;
        mentionCounts.set(key, (mentionCounts.get(key) ?? 0) + 1);
        if (!displayNameByKey.has(key)) displayNameByKey.set(key, name);
      }
    }

    const ranked = [...mentionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .filter(([key]) => {
        const inferred = inferenceByKey.get(key);
        if (!inferred) return true;
        return inferred.promotable;
      })
      .map(([key]) => displayNameByKey.get(key) ?? key);

    const candidates = ranked.map((name) => ({ name, type: 'PERSON' as EntityType }));

    let omegaResolved = 0;
    let charactersPromoted = 0;
    let charactersSkipped = 0;
    const promotedNames: string[] = [];

    if (candidates.length > 0) {
      const resolved = await omegaMemoryService.resolveEntities(userId, candidates);
      omegaResolved = resolved.length;

      for (const entity of resolved) {
        if (entity.type !== 'PERSON' && entity.type !== 'CHARACTER') continue;
        if (await isUserRejectedEntityCard(userId, entity.primary_name)) {
          charactersSkipped += 1;
          continue;
        }
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
        );
        if (characterId) {
          charactersPromoted += 1;
          promotedNames.push(entity.primary_name);
        } else {
          charactersSkipped += 1;
        }
      }
    }

    return { mentionCounts, omegaResolved, charactersPromoted, charactersSkipped, promotedNames };
  }

  /**
   * After entity deletion — re-scan only source messages tied to the removed card.
   * Does not replay the full chat corpus or re-validate unrelated lore.
   */
  async rescanDeletedEntitySourceLore(
    userId: string,
    opts: {
      messageIds: string[];
      deletedName: string;
      deletedAliases?: string[];
    },
  ): Promise<CharacterRescanSummary> {
    const deletedKeys = [opts.deletedName, ...(opts.deletedAliases ?? [])]
      .map(normalizeNameKey)
      .filter(Boolean);
    await characterRescanStateService.removeValidatedKeys(userId, deletedKeys);

    const episodes = await this.loadEpisodesByMessageIds(userId, opts.messageIds);
    const knownPersonKeys = await characterRescanStateService.buildValidatedPersonKeySet(userId);

    const promotion = await this.promotePersonsFromEpisodes(userId, episodes, knownPersonKeys);

    await characterRescanStateService.recordDeletionSourceRescan(userId);
    if (promotion.promotedNames.length > 0) {
      await characterRescanStateService.recordRescanComplete(userId, {
        watermarkAt: new Date().toISOString(),
        newValidatedKeys: promotion.promotedNames.map(normalizeNameKey),
      });
    }

    const summary: CharacterRescanSummary = {
      scannedEpisodes: episodes.length,
      incremental: false,
      targetedSourceRescan: true,
      skippedKnownPersons: knownPersonKeys.size,
      personsDiscovered: promotion.mentionCounts.size,
      omegaResolved: promotion.omegaResolved,
      charactersPromoted: promotion.charactersPromoted,
      charactersSkipped: promotion.charactersSkipped,
      restoredFromEvidence: 0,
      promotedNames: [...new Set(promotion.promotedNames)].sort((a, b) => a.localeCompare(b)),
      sourceMessageIds: opts.messageIds,
    };

    logger.info({ userId, summary, deletedName: opts.deletedName }, 'Deletion-targeted source lore rescan completed');
    return summary;
  }

  async rescan(
    userId: string,
    opts: { incremental?: boolean; cardCleanup?: boolean; cardAudit?: boolean; fullRescan?: boolean } = {},
  ): Promise<CharacterRescanSummary> {
    const incremental = opts.fullRescan ? false : opts.incremental !== false;
    const runCardAudit = opts.cardAudit !== false;

    let cardCleanupSummary: CharacterRescanSummary['cardCleanup'];
    let cardAuditSummary: CharacterRescanSummary['cardAudit'];

    if (runCardAudit) {
      const auditReport = await characterCardRescanAuditService.applyRescanAudit(userId);
      cardAuditSummary = {
        autoRemoved: auditReport.autoRemoved,
        queuedForReview: auditReport.queuedForReview,
        deletedAfterThreeStrikes: auditReport.deletedAfterThreeStrikes,
        reviewSuggestions: auditReport.reviewSuggestions.map((s) => ({
          characterId: s.characterId,
          name: s.name,
          status: s.status,
          reason: s.reason,
          suggestedTitle: s.suggestedTitle,
          reviewRound: s.reviewRound,
          maxRounds: s.maxRounds,
        })),
      };
      cardCleanupSummary = {
        applied: auditReport.autoRemoved + auditReport.deletedAfterThreeStrikes,
        skipped: auditReport.queuedForReview,
        actions: auditReport.actions.map((a) => ({
          currentTitle: a.currentTitle,
          applied: a.applied,
        })),
      };
    } else if (opts.cardCleanup === true) {
      const { characterCardCleanupService } = await import('./characters/audit/characterCardCleanupService');
      const cleanup = await characterCardCleanupService.applySafeFixes(userId);
      cardCleanupSummary = {
        applied: cleanup.applied,
        skipped: cleanup.skipped,
        actions: cleanup.actions
          .filter((a) => a.applied !== 'skipped')
          .map((a) => ({
            currentTitle: a.currentTitle,
            applied: a.applied,
            targetTitle: a.targetTitle,
          })),
      };
    }

    await selfCharacterService.repairSelfCharacterIdentity(userId);

    const rescanState = await characterRescanStateService.load(userId);
    const knownPersonKeys = await characterRescanStateService.buildValidatedPersonKeySet(userId);

    let episodes: EpisodeRow[] = [];
    if (opts.fullRescan || incremental === false) {
      episodes = await this.loadEpisodes(userId);
    } else if (rescanState.watermarkAt) {
      episodes = await this.loadEpisodes(userId, 500, rescanState.watermarkAt);
    }

    const promotion = await this.promotePersonsFromEpisodes(userId, episodes, knownPersonKeys);
    const { mentionCounts, omegaResolved, charactersPromoted, charactersSkipped, promotedNames } = promotion;

    const skippedKnownPersons = knownPersonKeys.size;

    let restoredFromEvidence = 0;
    if (!incremental) {
      const restoreReport = await characterRestoreService.restoreAllCharacters(userId);
      restoredFromEvidence = Math.max(0, restoreReport.afterCount - restoreReport.beforeCount);

      const { data: archivedCharacters } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias, metadata')
        .eq('user_id', userId)
        .eq('status', 'archived');
      let reactivatedArchived = 0;
      for (const row of archivedCharacters ?? []) {
        const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
        const queue = meta.card_audit_review_queue as { status?: string } | undefined;
        if (queue?.status === 'pending') continue;

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
      restoredFromEvidence += reactivatedArchived;

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

      try {
        const { rescanTimelineStitching } = await import('./timeline/timelineStitchingIntegrationService');
        await rescanTimelineStitching(userId, episodes);
      } catch (err) {
        logger.debug({ err, userId }, 'Timeline stitching after character rescan failed (non-blocking)');
      }

      try {
        const { rescanOrganizationInference } = await import(
          './organizations/inference/organizationInferenceIntegrationService'
        );
        await rescanOrganizationInference(
          userId,
          episodes.map((ep) => ({ id: ep.id, text: ep.text })),
        );
      } catch (err) {
        logger.debug({ err, userId }, 'Organization inference after character rescan failed (non-blocking)');
      }

      try {
        const { rescanQuestLogInference } = await import(
          './questLog/inference/questLogInferenceIntegrationService'
        );
        await rescanQuestLogInference(
          userId,
          episodes.map((ep) => ({ id: ep.id, text: ep.text })),
        );
      } catch (err) {
        logger.debug({ err, userId }, 'Quest Log inference after character rescan failed (non-blocking)');
      }

      try {
        const { rescanEmotionInference } = await import('./emotion/emotionInferenceIntegrationService');
        await rescanEmotionInference(
          userId,
          episodes.map((ep) => ({ id: ep.id, text: ep.text })),
        );
      } catch (err) {
        logger.debug({ err, userId }, 'Emotion inference after character rescan failed (non-blocking)');
      }
    }

    const summary: CharacterRescanSummary = {
      scannedEpisodes: episodes.length,
      incremental: incremental && Boolean(rescanState.watermarkAt),
      skippedKnownPersons,
      personsDiscovered: mentionCounts.size,
      omegaResolved,
      charactersPromoted,
      charactersSkipped,
      restoredFromEvidence,
      promotedNames: [...new Set(promotedNames)].sort((a, b) => a.localeCompare(b)),
      cardCleanup: cardCleanupSummary,
      cardAudit: cardAuditSummary,
    };

    if (episodes.length > 0 || !rescanState.watermarkAt) {
      const watermarkAt =
        episodes.length > 0
          ? episodes.reduce((max, ep) => (ep.at > max ? ep.at : max), episodes[0].at)
          : rescanState.watermarkAt ?? new Date().toISOString();

      await characterRescanStateService.recordRescanComplete(userId, {
        watermarkAt,
        newValidatedKeys: promotedNames.map(normalizeNameKey),
      });
    }

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
