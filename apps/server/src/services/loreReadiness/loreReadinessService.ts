import { logger } from '../../logger';
import { contentAvailabilityService } from '../biographyGeneration/contentAvailabilityService';
import { supabaseAdmin } from '../supabaseClient';
import {
  buildDomainCoverage,
  filterAtoms,
  invalidateAtomCache,
  loadAllAtoms,
  sliceMetrics,
} from './atomIndexService';
import { aggregateDomainCoverage } from './domainMapping';
import {
  bestFocusScore,
  buildCharacterFocusCandidates,
  buildEraFocusCandidates,
  buildLocationFocusCandidates,
  buildOrganizationFocusCandidates,
  buildSkillFocusCandidates,
  buildThreadFocusCandidates,
  filterAtomsForFocus,
  focusToEntityCandidate,
  formatSignalLine,
  summarizeFocusSignals,
} from './focusCandidates';
import { readinessCache } from './readinessCache';
import { invalidateLedger, loadLedgerSummary, syncTopicLedger } from './ledgerService';
import {
  buildGaps,
  gapsToSuggestions,
  levelFromProgress,
  scoreDimensions,
  topicToProfile,
  weightedProgress,
  type ReadinessProfile,
} from './readinessScorer';
import { resolveCompileTarget } from './topicResolver';
import { DYNAMIC_COMPILE_PROFILE, LORE_TOPICS, MIN_ATOMS_ANY_BOOK, getTopicById } from './topics';
import type {
  ContentStatsSnapshot,
  FocusCandidate,
  LoreReadinessEvaluateRequest,
  LoreReadinessEvaluation,
  LoreReadinessSummary,
  LoreTopicId,
  LoreTopicReadiness,
} from './types';

const ATOMS_PER_PAGE = { summary: 12, detailed: 6, epic: 4 };

export class LoreReadinessService {
  invalidateCache(userId: string): void {
    readinessCache.invalidate(userId);
    invalidateAtomCache(userId);
    void invalidateLedger(userId);
  }

  async getSummary(userId: string): Promise<LoreReadinessSummary> {
    const atoms = await loadAllAtoms(userId);
    const cached = readinessCache.get(userId, atoms.length);
    if (cached) return cached;

    const ledgerSummary = await loadLedgerSummary(userId, atoms.length);
    if (ledgerSummary) {
      const enriched = await this.enrichSummaryStats(userId, atoms, ledgerSummary);
      readinessCache.set(userId, atoms.length, enriched);
      return enriched;
    }

    const summary = await this.buildSummary(userId, atoms);
    readinessCache.set(userId, atoms.length, summary);
    void syncTopicLedger(userId, summary);
    logger.info(
      {
        userId,
        event: 'lore.readiness.evaluated',
        atomCount: summary.stats.totalNarrativeAtoms,
        readyTopics: summary.readyTopicCount,
        knowledgeScore: summary.knowledgeScore,
      },
      'Lore readiness summary computed'
    );
    return summary;
  }

  async getTopicReadiness(userId: string, topicId: LoreTopicId): Promise<LoreTopicReadiness | null> {
    const topic = getTopicById(topicId);
    if (!topic) return null;
    const atoms = await loadAllAtoms(userId);
    const contentStats = await contentAvailabilityService.getContentStats(userId);
    const stats: ContentStatsSnapshot = {
      totalJournalEntries: contentStats.totalJournalEntries,
      totalChatMessages: contentStats.totalChatMessages,
      totalNarrativeAtoms: atoms.length,
      totalWordCount: contentStats.totalWordCount,
      domainCoverage: buildDomainCoverage(atoms),
      entityCounts: contentStats.entityCounts,
    };
    return this.scoreTopic(userId, topic, atoms, stats, buildDomainCoverage(atoms));
  }

  async evaluate(userId: string, request: LoreReadinessEvaluateRequest): Promise<LoreReadinessEvaluation> {
    const atoms = await loadAllAtoms(userId);
    const target = await resolveCompileTarget(userId, request);
    const profile = target.topicId
      ? topicToProfile(getTopicById(target.topicId)!)
      : dynamicProfileForSpec(target.spec);

    const filtered = filterAtoms(atoms, {
      ...target.spec,
      topicDomain: target.topicDomain,
      organizationNames: target.organizationNames,
    });
    const metrics = sliceMetrics(filtered);
    const evidenceScore = await this.computeEvidenceScore(userId, target.spec);
    const dimensions = scoreDimensions(metrics, profile, evidenceScore);
    const progress = weightedProgress(dimensions);
    const gaps = buildGaps(metrics, profile, evidenceScore, target.label);
    const depth = target.spec.depth ?? 'detailed';

    return {
      label: target.label,
      spec: target.spec,
      level: levelFromProgress(progress),
      progress,
      canGenerate: progress >= 1,
      atomCount: metrics.atomCount,
      entryCount: metrics.entryCount,
      wordCount: metrics.wordCount,
      estimatedPages: Math.max(1, Math.floor(metrics.atomCount / ATOMS_PER_PAGE[depth])),
      atomsNeeded: Math.max(0, profile.minAtoms - metrics.atomCount),
      entriesNeeded: Math.max(0, profile.minEntries - metrics.entryCount),
      gaps,
      dimensionScores: dimensions,
      suggestions: gapsToSuggestions(gaps),
    };
  }

  private async enrichSummaryStats(
    userId: string,
    atoms: Awaited<ReturnType<typeof loadAllAtoms>>,
    partial: LoreReadinessSummary
  ): Promise<LoreReadinessSummary> {
    const contentStats = await contentAvailabilityService.getContentStats(userId);
    const domainCoverage = buildDomainCoverage(atoms);
    const overallProgress = Math.min(1, atoms.length / MIN_ATOMS_ANY_BOOK);
    const readyTopicCount = partial.topics.filter((t) => t.level === 'ready').length;
    const buildingTopicCount = partial.topics.filter((t) => t.level === 'building').length;

    return {
      ...partial,
      stats: {
        totalJournalEntries: contentStats.totalJournalEntries,
        totalChatMessages: contentStats.totalChatMessages,
        totalNarrativeAtoms: atoms.length,
        totalWordCount: contentStats.totalWordCount,
        domainCoverage,
        entityCounts: contentStats.entityCounts,
      },
      overallProgress,
      overallLevel: levelFromProgress(overallProgress),
      canGenerateAnyBook: atoms.length >= MIN_ATOMS_ANY_BOOK,
      readyTopicCount,
      buildingTopicCount,
      knowledgeScore: Math.round(
        overallProgress * 40 +
          readyTopicCount * 5 +
          buildingTopicCount * 2 +
          Math.min(contentStats.entityCounts.characters, 10) +
          Math.min(contentStats.entityCounts.locations, 5)
      ),
    };
  }

  private async buildSummary(userId: string, atoms: Awaited<ReturnType<typeof loadAllAtoms>>): Promise<LoreReadinessSummary> {
    const [contentStats, entityCounts] = await Promise.all([
      contentAvailabilityService.getContentStats(userId),
      this.loadEntityCounts(userId),
    ]);

    const domainCoverage = buildDomainCoverage(atoms);
    const stats: ContentStatsSnapshot = {
      totalJournalEntries: contentStats.totalJournalEntries,
      totalChatMessages: contentStats.totalChatMessages,
      totalNarrativeAtoms: atoms.length,
      totalWordCount: contentStats.totalWordCount,
      domainCoverage,
      entityCounts,
    };

    const topics = await Promise.all(
      LORE_TOPICS.map((topic) => this.scoreTopic(userId, topic, atoms, stats, domainCoverage))
    );

    const overallProgress = Math.min(1, atoms.length / MIN_ATOMS_ANY_BOOK);
    const readyTopicCount = topics.filter((t) => t.level === 'ready').length;
    const buildingTopicCount = topics.filter((t) => t.level === 'building').length;

    const knowledgeScore = Math.round(
      overallProgress * 40 +
        readyTopicCount * 5 +
        buildingTopicCount * 2 +
        Math.min(entityCounts.characters, 10) +
        Math.min(entityCounts.locations, 5)
    );

    return {
      stats,
      overallProgress,
      overallLevel: levelFromProgress(overallProgress),
      canGenerateAnyBook: atoms.length >= MIN_ATOMS_ANY_BOOK,
      topics,
      readyTopicCount,
      buildingTopicCount,
      knowledgeScore,
    };
  }

  private async buildFocusCandidatesForTopic(
    userId: string,
    topic: (typeof LORE_TOPICS)[number],
    atoms: Awaited<ReturnType<typeof loadAllAtoms>>
  ): Promise<FocusCandidate[]> {
    const mins = { atoms: topic.minAtoms, entries: topic.minEntries };

    switch (topic.id) {
      case 'character_book':
        return buildCharacterFocusCandidates(userId, atoms, topic.id, mins);
      case 'place_book':
        return buildLocationFocusCandidates(userId, atoms, topic.id, mins);
      case 'professional': {
        const [orgs, threads] = await Promise.all([
          buildOrganizationFocusCandidates(userId, atoms, topic.id, mins),
          buildThreadFocusCandidates(userId, atoms, topic.id, mins, 'career', 'professional'),
        ]);
        return [...orgs, ...threads]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      }
      case 'relationships': {
        const [threads, people] = await Promise.all([
          buildThreadFocusCandidates(userId, atoms, topic.id, mins, 'relationship', 'relationships'),
          buildCharacterFocusCandidates(userId, atoms, topic.id, mins, {
            domainHint: 'relationships',
          }),
        ]);
        return [...threads, ...people].sort((a, b) => b.score - a.score).slice(0, 5);
      }
      case 'family': {
        const [threads, people] = await Promise.all([
          buildThreadFocusCandidates(userId, atoms, topic.id, mins, 'custom', 'family'),
          buildCharacterFocusCandidates(userId, atoms, topic.id, mins, { domainHint: 'family' }),
        ]);
        // Also try category null family-named threads via domain people primarily
        return [...people, ...threads].sort((a, b) => b.score - a.score).slice(0, 5);
      }
      case 'creative': {
        const [skills, threads] = await Promise.all([
          buildSkillFocusCandidates(userId, atoms, topic.id, mins, 'creative'),
          buildThreadFocusCandidates(userId, atoms, topic.id, mins, 'project', 'creative'),
        ]);
        return [...skills, ...threads].sort((a, b) => b.score - a.score).slice(0, 5);
      }
      case 'health':
        return buildThreadFocusCandidates(userId, atoms, topic.id, mins, 'health', 'health');
      case 'education': {
        const [skills, eras] = await Promise.all([
          buildSkillFocusCandidates(userId, atoms, topic.id, mins, 'education'),
          buildEraFocusCandidates(filterAtoms(atoms, { topicDomain: 'education' }), topic.id, mins),
        ]);
        return [...skills, ...eras].sort((a, b) => b.score - a.score).slice(0, 5);
      }
      case 'personal': {
        const eras = await buildEraFocusCandidates(
          filterAtoms(atoms, { topicDomain: 'personal' }),
          topic.id,
          mins
        );
        const threads = await buildThreadFocusCandidates(
          userId,
          atoms,
          topic.id,
          mins,
          undefined,
          'personal'
        );
        return [...eras, ...threads].sort((a, b) => b.score - a.score).slice(0, 5);
      }
      case 'full_life': {
        // Self is implicit; optional era slices only
        return buildEraFocusCandidates(atoms, topic.id, mins);
      }
      default:
        return [];
    }
  }

  private async scoreTopic(
    userId: string,
    topic: (typeof LORE_TOPICS)[number],
    atoms: Awaited<ReturnType<typeof loadAllAtoms>>,
    stats: ContentStatsSnapshot,
    domainCoverage?: Array<{ domain: string; atomCount: number; entryCount: number }>
  ): Promise<LoreTopicReadiness> {
    const profile = topicToProfile(topic);
    let filtered = atoms;
    let evidenceScore = 100;
    const focusCandidates = await this.buildFocusCandidatesForTopic(userId, topic, atoms);
    const entityCandidates = focusCandidates.map(focusToEntityCandidate);

    if (topic.id === 'full_life') {
      filtered = atoms;
    } else if (topic.id === 'character_book' || topic.id === 'place_book') {
      const best = focusCandidates[0];
      if (best) {
        filtered = filterAtomsForFocus(atoms, best);
        if (best.compileRef.characterId) {
          evidenceScore = await this.computeEntityEvidenceScore(
            userId,
            'character',
            best.compileRef.characterId
          );
        } else if (best.compileRef.locationId) {
          evidenceScore = await this.computeEntityEvidenceScore(
            userId,
            'location',
            best.compileRef.locationId
          );
        }
      } else {
        filtered = [];
        evidenceScore = 0;
      }
    } else if (topic.domain) {
      filtered = filterAtoms(atoms, { topicDomain: topic.domain });
    }

    const metrics = sliceMetrics(filtered);

    if (topic.domain && domainCoverage) {
      const aggregated = aggregateDomainCoverage(domainCoverage, topic.domain);
      metrics.atomCount = Math.max(metrics.atomCount, aggregated.atomCount);
      metrics.entryCount = Math.max(metrics.entryCount, aggregated.entryCount);
    }

    if (topic.minEntities) {
      if (
        topic.minEntities.characters &&
        metrics.entityIds.characters.length === 0 &&
        stats.entityCounts.characters > 0
      ) {
        metrics.entityIds.characters = ['__any__'];
      }
      if (
        topic.minEntities.locations &&
        metrics.entityIds.locations.length === 0 &&
        stats.entityCounts.locations > 0
      ) {
        metrics.entityIds.locations = ['__any__'];
      }
    }

    const dimensions = scoreDimensions(metrics, profile, evidenceScore);
    let progress = weightedProgress(dimensions);

    // When focus options exist, lift progress toward the best focus score (optioned topics)
    if (focusCandidates.length > 0 && topic.id !== 'full_life') {
      const focusBest = bestFocusScore(focusCandidates);
      progress = Math.max(progress, focusBest * 0.95);
      // Ready if any focus can compile OR domain aggregate is ready
      if (focusCandidates.some((c) => c.canCompile)) {
        progress = Math.max(progress, 1);
      }
    }

    const gaps = buildGaps(metrics, profile, evidenceScore, topic.label);

    const entryCount =
      topic.id === 'full_life'
        ? stats.totalJournalEntries + Math.floor(stats.totalChatMessages / 4)
        : metrics.entryCount;

    const focusSignals = summarizeFocusSignals(focusCandidates);
    const domainSignals = {
      atomCount: metrics.atomCount,
      wordCount: metrics.wordCount,
      entryCount,
      meaningClusters: 0,
      threadLinks: focusCandidates.length,
      evidenceFacts: 0,
    };
    const signalSummary = formatSignalLine(focusSignals ?? domainSignals);

    const canGenerate =
      progress >= 1 ||
      (focusCandidates.some((c) => c.canCompile) && metrics.atomCount >= Math.min(4, topic.minAtoms));

    return {
      topic,
      level: levelFromProgress(Math.min(1, progress)),
      progress: Math.min(1, progress),
      atomCount: metrics.atomCount,
      entryCount,
      wordCount: metrics.wordCount,
      atomsNeeded: Math.max(0, profile.minAtoms - metrics.atomCount),
      entriesNeeded: Math.max(0, profile.minEntries - metrics.entryCount),
      canGenerate,
      gaps,
      dimensionScores: dimensions,
      focusCandidates: focusCandidates.length > 0 ? focusCandidates : undefined,
      signalSummary,
      entityCandidates: entityCandidates.length > 0 ? entityCandidates : undefined,
    };
  }

  private async loadEntityCounts(userId: string): Promise<ContentStatsSnapshot['entityCounts']> {
    const stats = await contentAvailabilityService.getContentStats(userId);
    return stats.entityCounts;
  }

  private async computeEvidenceScore(
    userId: string,
    spec: LoreReadinessEvaluation['spec']
  ): Promise<number> {
    if (spec.characterIds?.length === 1) {
      return this.computeEntityEvidenceScore(userId, 'character', spec.characterIds[0]);
    }
    if (spec.locationIds?.length === 1) {
      return this.computeEntityEvidenceScore(userId, 'location', spec.locationIds[0]);
    }
    return 100;
  }

  private async computeEntityEvidenceScore(
    userId: string,
    entityType: 'character' | 'location',
    entityId: string
  ): Promise<number> {
    const { count } = await supabaseAdmin
      .from('entity_facts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    const facts = count ?? 0;
    return Math.min(100, 30 + facts * 15);
  }
}

function dynamicProfileForSpec(spec: LoreReadinessEvaluation['spec']): ReadinessProfile {
  if (spec.scope === 'full_life') {
    const fullLife = getTopicById('full_life')!;
    return topicToProfile(fullLife);
  }
  if (spec.scope === 'domain' && spec.domain) {
    const match = LORE_TOPICS.find((t) => t.domain === spec.domain);
    if (match) return topicToProfile(match);
  }
  return {
    minAtoms: DYNAMIC_COMPILE_PROFILE.minAtoms,
    minEntries: DYNAMIC_COMPILE_PROFILE.minEntries,
    minTimeSpanMonths: DYNAMIC_COMPILE_PROFILE.minTimeSpanMonths,
    minEvidenceScore: DYNAMIC_COMPILE_PROFILE.minEvidenceScore,
  };
}

export const loreReadinessService = new LoreReadinessService();
