import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { LORE_TOPICS } from './topics';
import type {
  LoreReadinessSummary,
  LoreTopicReadiness,
  ReadinessGap,
  ReadinessDimensionScores,
  EntityReadinessCandidate,
} from './types';

export type LedgerRow = {
  topic_key: string;
  topic_label: string;
  atom_count: number;
  entry_count: number;
  word_count: number;
  progress: number;
  readiness_level: string;
  can_generate: boolean;
  atom_type_counts: Record<string, number>;
  gaps: ReadinessGap[];
  entity_candidates?: EntityReadinessCandidate[];
  dimension_scores?: ReadinessDimensionScores;
  total_atoms_snapshot: number;
  updated_at: string;
};

function topicKey(topicId: string): string {
  return `template:${topicId}`;
}

export async function syncTopicLedger(
  userId: string,
  summary: LoreReadinessSummary
): Promise<void> {
  const snapshot = summary.stats.totalNarrativeAtoms;
  const rows = summary.topics.map((topic) => ledgerRowFromTopic(topic, snapshot));

  try {
    if (rows.length === 0) return;

    const { error } = await supabaseAdmin.from('lore_topic_ledger').upsert(
      rows.map((row) => ({ user_id: userId, ...row })),
      { onConflict: 'user_id,topic_key' }
    );

    if (error) {
      logger.warn({ error, userId }, 'Failed to sync lore topic ledger');
    }
  } catch (error) {
    logger.warn({ error, userId }, 'Lore topic ledger sync failed');
  }
}

function ledgerRowFromTopic(topic: LoreTopicReadiness, snapshot: number): Omit<LedgerRow, 'updated_at'> {
  return {
    topic_key: topicKey(topic.topic.id),
    topic_label: topic.topic.label,
    atom_count: topic.atomCount,
    entry_count: topic.entryCount,
    word_count: topic.wordCount ?? 0,
    progress: topic.progress,
    readiness_level: topic.level,
    can_generate: topic.canGenerate,
    atom_type_counts: {},
    gaps: topic.gaps ?? [],
    entity_candidates: topic.entityCandidates,
    dimension_scores: topic.dimensionScores,
    total_atoms_snapshot: snapshot,
  };
}

export async function loadLedgerSummary(
  userId: string,
  atomSnapshot: number
): Promise<LoreReadinessSummary | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('lore_topic_ledger')
      .select('*')
      .eq('user_id', userId)
      .eq('total_atoms_snapshot', atomSnapshot);

    if (error || !data || data.length < LORE_TOPICS.length) return null;

    const topics: LoreTopicReadiness[] = [];
    for (const template of LORE_TOPICS) {
      const row = data.find((r) => r.topic_key === topicKey(template.id));
      if (!row) return null;
      topics.push(topicFromLedgerRow(template, row as LedgerRow));
    }

    const readyTopicCount = topics.filter((t) => t.level === 'ready').length;
    const buildingTopicCount = topics.filter((t) => t.level === 'building').length;
    const overallProgress = Math.min(1, atomSnapshot / 20);

    return {
      stats: {
        totalJournalEntries: 0,
        totalChatMessages: 0,
        totalNarrativeAtoms: atomSnapshot,
        totalWordCount: 0,
        domainCoverage: [],
        entityCounts: { characters: 0, locations: 0, events: 0, skills: 0 },
      },
      overallProgress,
      overallLevel: overallProgress >= 1 ? 'ready' : overallProgress >= 0.45 ? 'building' : 'needs_more',
      canGenerateAnyBook: atomSnapshot >= 20,
      topics,
      readyTopicCount,
      buildingTopicCount,
      knowledgeScore: Math.round(overallProgress * 40 + readyTopicCount * 5 + buildingTopicCount * 2),
    };
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to load lore topic ledger');
    return null;
  }
}

function topicFromLedgerRow(
  template: (typeof LORE_TOPICS)[number],
  row: LedgerRow
): LoreTopicReadiness {
  return {
    topic: template,
    level: row.readiness_level as LoreTopicReadiness['level'],
    progress: Number(row.progress),
    atomCount: row.atom_count,
    entryCount: row.entry_count,
    wordCount: row.word_count,
    atomsNeeded: Math.max(0, template.minAtoms - row.atom_count),
    entriesNeeded: Math.max(0, template.minEntries - row.entry_count),
    canGenerate: row.can_generate,
    gaps: row.gaps ?? [],
    dimensionScores: row.dimension_scores,
    entityCandidates: row.entity_candidates,
  };
}

export async function invalidateLedger(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from('lore_topic_ledger').delete().eq('user_id', userId);
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to invalidate lore topic ledger');
  }
}
