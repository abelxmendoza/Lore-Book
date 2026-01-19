/**
 * Ranking and Confidence Service for Memory Recall Engine
 * 
 * Ranks recall candidates and computes confidence scores.
 */

import { logger } from '../../logger';
import { beliefRealityReconciliationService } from '../beliefRealityReconciliationService';
import { embeddingService } from '../embeddingService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';

import type { RecallIntent, RecallEntry, RecallEvent } from './types';

export class RankingService {
  /**
   * Rank candidates based on intent and compute scores
   */
  async rankCandidates(
    candidates: { entries: RecallEntry[]; events: RecallEvent[] },
    intent: RecallIntent,
    queryText: string
  ): Promise<{ entries: RecallEntry[]; events: RecallEvent[] }> {
    try {
      // Generate query embedding for similarity computation
      const queryEmbedding = await embeddingService.embedText(queryText);

      // Rank entries
      const rankedEntries = await Promise.all(
        candidates.entries.map(async (entry) => {
          const score = await this.computeRankScore(entry, intent, queryEmbedding, userId);
          return { ...entry, rank_score: score };
        })
      );

      // Sort by rank score (highest first)
      rankedEntries.sort((a, b) => b.rank_score - a.rank_score);

      // Take top N results
      const topEntries = rankedEntries.slice(0, 5);

      // Events ranking (placeholder for future)
      const rankedEvents: RecallEvent[] = [];

      logger.debug(
        {
          intentType: intent.type,
          totalCandidates: candidates.entries.length,
          topResults: topEntries.length,
        },
        'Ranked recall candidates'
      );

      return { entries: topEntries, events: rankedEvents };
    } catch (error) {
      logger.error({ error, intent }, 'Failed to rank recall candidates');
      return { entries: candidates.entries.slice(0, 5), events: [] };
    }
  }

  /**
   * Compute rank score for an entry
   */
  private async computeRankScore(
    entry: RecallEntry,
    intent: RecallIntent,
    queryEmbedding: number[],
    userId?: string
  ): Promise<number> {
    let score = 0;

    // Semantic similarity (if embedding available)
    if (entry.metadata?.embedding) {
      const similarity = this.computeSimilarity(
        queryEmbedding,
        entry.metadata.embedding as number[]
      );
      entry.similarity_score = similarity;
      score += similarity * 0.4; // 40% weight
    }

    // Recency weight (more recent = higher score)
    const recencyWeight = this.computeRecencyWeight(entry.date);
    score += recencyWeight * 0.2; // 20% weight

    // Confidence weight (from entry confidence)
    score += entry.confidence * 0.15; // 15% weight

    // Epistemic authority ranking (knowledge type)
    const knowledgeType = entry.metadata?.knowledge_type as string | undefined;
    if (knowledgeType) {
      const epistemicRank = knowledgeTypeEngineService.getEpistemicRank(knowledgeType as any);
      score += (epistemicRank / 5) * 0.15; // 15% weight for epistemic authority
    }

    // Intent-specific boosts
    if (intent.type === 'EMOTIONAL_SIMILARITY' && intent.emotions?.length) {
      const emotionMatch = this.computeEmotionMatch(entry, intent.emotions);
      score += emotionMatch * 0.1; // 10% weight
    }

    if (intent.type === 'ENTITY_LOOKUP' && intent.entities?.length) {
      const entityMatch = this.computeEntityMatch(entry, intent.entities);
      score += entityMatch * 0.1; // 10% weight
    }

    // Conflict penalty (if entry has contradictions)
    const conflictPenalty = this.computeConflictPenalty(entry);
    score -= conflictPenalty;

    return Math.max(0, Math.min(1, score)); // Clamp to [0, 1]
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  private computeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Compute recency weight (exponential decay)
   */
  private computeRecencyWeight(date: string): number {
    const now = Date.now();
    const entryDate = new Date(date).getTime();
    const ageInDays = (now - entryDate) / (1000 * 60 * 60 * 24);

    // Exponential decay: e^(-age/180) for 6-month half-life
    return Math.exp(-ageInDays / 180);
  }

  /**
   * Compute emotion match score
   */
  private computeEmotionMatch(entry: RecallEntry, targetEmotions: string[]): number {
    if (!entry.emotions?.length) return 0;

    const entryEmotionsLower = entry.emotions.map((e) => e.toLowerCase());
    const targetEmotionsLower = targetEmotions.map((e) => e.toLowerCase());

    const matches = targetEmotionsLower.filter((emotion) =>
      entryEmotionsLower.some((e) => e.includes(emotion) || emotion.includes(e))
    ).length;

    return matches / targetEmotions.length;
  }

  /**
   * Compute entity match score
   */
  private computeEntityMatch(entry: RecallEntry, targetEntities: string[]): number {
    const contentLower = entry.content.toLowerCase();
    const peopleLower = entry.people?.map((p) => p.toLowerCase()) ?? [];

    const matches = targetEntities.filter((entity) => {
      const entityLower = entity.toLowerCase();
      return (
        contentLower.includes(entityLower) ||
        peopleLower.some((p) => p.includes(entityLower) || entityLower.includes(p))
      );
    }).length;

    return matches / targetEntities.length;
  }

  /**
   * Compute conflict penalty (if entry has contradictions)
   */
  private computeConflictPenalty(entry: RecallEntry): number {
    const metadata = entry.metadata || {};
    const hasContradictions = metadata.hasContradictions as boolean | undefined;
    const verificationStatus = metadata.verification_status as string | undefined;

    if (hasContradictions || verificationStatus === 'contradicted') {
      return 0.3; // Penalty for contradictions
    }

    if (verificationStatus === 'ambiguous') {
      return 0.1; // Smaller penalty for ambiguity
    }

    return 0;
  }

  /**
   * Compute overall recall confidence
   */
  computeRecallConfidence(results: {
    entries: RecallEntry[];
    events: RecallEvent[];
  }): number {
    if (results.entries.length === 0) {
      return 0.0;
    }

    // Average confidence of top results
    const avgConfidence =
      results.entries.reduce((sum, e) => sum + e.confidence, 0) /
      results.entries.length;

    // Variance penalty (high variance = lower confidence)
    const variances = results.entries.map((e) => Math.abs(e.confidence - avgConfidence));
    const avgVariance =
      variances.reduce((sum, v) => sum + v, 0) / variances.length;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, avgConfidence - avgVariance * 0.5));
  }
}

