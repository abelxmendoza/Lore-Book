// =====================================================
// MEMORY RECALL ENGINE
// Purpose: Natural language recall with enrichment-based ranking
// =====================================================

import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { embeddingService } from '../embeddingService';
import { entityConfidenceService } from '../entityConfidenceService';
import { supabaseAdmin } from '../supabaseClient';
import { epistemicTypeChecker } from '../compiler/epistemicTypeChecker';
import { contractLayer, CONTRACTS } from '../compiler/contractLayer';
import type { MemoryEntry } from '../../types';
import type { Persona } from '../personaController';

export type RecallIntent = 'EMOTIONAL_RECALL' | 'TEMPORAL_RECALL' | 'PATTERN_LOOKBACK' | 'GENERAL_RECALL';
export type Phrasing = 'STRONG' | 'TENTATIVE';

export interface RecallQuery {
  text: string;
  persona: Persona;
}

export interface RecallMoment {
  entry_id: string;
  timestamp: string;
  emotions: string[];
  themes: string[];
  related_entities: string[];
  summary: string;
  similarity_score: number;
  rank_score: number;
}

export interface RecallResult {
  moments: RecallMoment[];
  confidence: number;
  phrasing: Phrasing;
  explanation: string;
}

export interface SilenceResponse {
  message: string;
  reason: string;
  confidence: number;
}

export class MemoryRecallEngine {
  /**
   * Recall memories based on natural language query
   * Uses EntryIR for better epistemic filtering
   */
  async recallMemory(userId: string, query: RecallQuery): Promise<RecallResult | SilenceResponse> {
    try {
      // Detect recall intent
      const intent = this.detectRecallIntent(query.text);

      // Apply ARCHIVIST contract (facts only, no inference)
      const contract = CONTRACTS.ARCHIVIST;

      // Try to use IR first (if available)
      // Phase 3.6: Contract already filters by canon status
      const irCandidates = await this.searchIR(userId, query.text, 20);
      
      // Apply contract to filter candidates (includes canon gating)
      let candidates: any[];
      if (irCandidates.length > 0) {
        // Apply contract to IR candidates (epistemic + canon filtering)
        const constrainedView = contractLayer.applyContract(contract, irCandidates);
        candidates = constrainedView.entries;
      } else {
        // Fallback to regular semantic search if IR not available
        candidates = await memoryService.semanticSearchEntries(
          userId,
          query.text,
          20, // Get more for ranking
          0.4 // Lower threshold for recall
        );
      }

      if (candidates.length === 0) {
        return {
          message: "I don't see a clear match yet.",
          reason: 'No semantically similar entries found',
          confidence: 0.0,
        };
      }

      // Enrich candidates with metadata and rank
      const enrichedCandidates = await this.enrichAndRankCandidates(
        userId,
        candidates,
        query.text,
        intent
      );

      if (enrichedCandidates.length === 0) {
        return {
          message: "I don't see a clear match yet.",
          reason: 'No entries matched after enrichment filtering',
          confidence: 0.0,
        };
      }

      // Compute overall confidence
      const confidence = this.computeRecallConfidence(enrichedCandidates);
      const phrasing: Phrasing = confidence < 0.5 ? 'TENTATIVE' : 'STRONG';

      // Build explanation
      const explanation = this.buildRecallExplanation(intent, confidence, enrichedCandidates.length);

      // Return top 5 moments
      return {
        moments: enrichedCandidates.slice(0, 5),
        confidence,
        phrasing,
        explanation,
      };
    } catch (error) {
      logger.error({ error, userId, query }, 'Failed to recall memory');
      return {
        message: "I don't see a clear match yet.",
        reason: 'Error during recall',
        confidence: 0.0,
      };
    }
  }

  /**
   * Detect recall intent from query text
   */
  private detectRecallIntent(text: string): RecallIntent {
    const lowerText = text.toLowerCase();

    if (/(felt like this|same feeling|similar feeling|felt the same)/i.test(lowerText)) {
      return 'EMOTIONAL_RECALL';
    }

    if (/(last time|first time|when did|when was|how many times|how often)/i.test(lowerText)) {
      return 'TEMPORAL_RECALL';
    }

    if (/(pattern|keeps happening|always|recurring|repeated)/i.test(lowerText)) {
      return 'PATTERN_LOOKBACK';
    }

    return 'GENERAL_RECALL';
  }

  /**
   * Enrich candidates with metadata and rank by enrichment signals
   */
  private async enrichAndRankCandidates(
    userId: string,
    candidates: MemoryEntry[],
    queryText: string,
    intent: RecallIntent
  ): Promise<RecallMoment[]> {
    // Extract query emotions and themes for matching
    const { entryEnrichmentService } = await import('../entryEnrichmentService');
    const queryEnrichment = await entryEnrichmentService.enrichEntry(queryText, []);

    const enriched: RecallMoment[] = await Promise.all(
      candidates.map(async (entry) => {
        // Get enrichment metadata from utterance or entry
        const enrichment = await this.getEntryEnrichment(userId, entry.id);

        // Calculate emotion overlap
        const emotionOverlap = this.calculateEmotionOverlap(
          queryEnrichment.emotions,
          enrichment.emotions
        );

        // Calculate theme overlap
        const themeOverlap = this.calculateThemeOverlap(
          queryEnrichment.themes,
          enrichment.themes
        );

        // Get entity confidence
        const entityConfidence = await this.getEntityConfidenceForEntry(userId, entry.id);

        // Calculate recency weight
        const recencyWeight = this.calculateRecencyWeight(entry.date || entry.created_at || '');

        // Calculate conflict penalty (narrative divergence)
        const conflictPenalty = (entry as any).narrative_divergence ? 0.8 : 1.0;

        // Calculate rank score
        const similarity = (entry as any).similarity || 0.5;
        const rankScore =
          similarity *
          (1 + emotionOverlap * 0.3) *
          (1 + themeOverlap * 0.2) *
          recencyWeight *
          entityConfidence *
          conflictPenalty;

        return {
          entry_id: entry.id,
          timestamp: entry.date || entry.created_at || new Date().toISOString(),
          emotions: enrichment.emotions,
          themes: enrichment.themes,
          related_entities: enrichment.people,
          summary: entry.summary || entry.content.substring(0, 200),
          similarity_score: similarity,
          rank_score: rankScore,
        };
      })
    );

    // Sort by rank score
    return enriched.sort((a, b) => b.rank_score - a.rank_score);
  }

  /**
   * Get enrichment metadata for an entry
   */
  private async getEntryEnrichment(
    userId: string,
    entryId: string
  ): Promise<{ emotions: string[]; themes: string[]; people: string[] }> {
    try {
      // Try journal_entries first
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('metadata')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entry?.metadata) {
        return {
          emotions: (entry.metadata as any).emotions || [],
          themes: (entry.metadata as any).themes || [],
          people: (entry.metadata as any).people || [],
        };
      }

      return { emotions: [], themes: [], people: [] };
    } catch (error) {
      logger.debug({ error, entryId }, 'Failed to get entry enrichment');
      return { emotions: [], themes: [], people: [] };
    }
  }

  /**
   * Calculate emotion overlap between query and entry
   */
  private calculateEmotionOverlap(queryEmotions: string[], entryEmotions: string[]): number {
    if (queryEmotions.length === 0 || entryEmotions.length === 0) return 0;

    const querySet = new Set(queryEmotions.map(e => e.toLowerCase()));
    const entrySet = new Set(entryEmotions.map(e => e.toLowerCase()));

    const intersection = new Set([...querySet].filter(e => entrySet.has(e)));
    const union = new Set([...querySet, ...entrySet]);

    return intersection.size / union.size;
  }

  /**
   * Calculate theme overlap between query and entry
   */
  private calculateThemeOverlap(queryThemes: string[], entryThemes: string[]): number {
    if (queryThemes.length === 0 || entryThemes.length === 0) return 0;

    const querySet = new Set(queryThemes.map(t => t.toLowerCase()));
    const entrySet = new Set(entryThemes.map(t => t.toLowerCase()));

    const intersection = new Set([...querySet].filter(t => entrySet.has(t)));
    const union = new Set([...querySet, ...entrySet]);

    return intersection.size / union.size;
  }

  /**
   * Get entity confidence for entry
   */
  private async getEntityConfidenceForEntry(userId: string, entryId: string): Promise<number> {
    try {
      // Get entity mentions for this entry
      const { data: mentions } = await supabaseAdmin
        .from('entity_mentions')
        .select('entity_id')
        .eq('memory_id', entryId)
        .eq('user_id', userId)
        .limit(5);

      if (!mentions || mentions.length === 0) return 0.5;

      // Get average confidence
      const confidences = await Promise.all(
        mentions.map(async (m) => {
          try {
            const { data: entity } = await supabaseAdmin
              .from('entities')
              .select('confidence')
              .eq('id', m.entity_id)
              .eq('user_id', userId)
              .single();

            return entity?.confidence || 0.5;
          } catch {
            return 0.5;
          }
        })
      );

      return confidences.reduce((a, b) => a + b, 0) / confidences.length;
    } catch (error) {
      logger.debug({ error, entryId }, 'Failed to get entity confidence');
      return 0.5;
    }
  }

  /**
   * Calculate recency weight
   */
  private calculateRecencyWeight(dateStr: string): number {
    const now = Date.now();
    const entryDate = new Date(dateStr).getTime();
    const daysAgo = (now - entryDate) / (24 * 60 * 60 * 1000);

    if (daysAgo <= 30) return 1.2; // Recent boost
    if (daysAgo <= 90) return 1.0; // Normal
    return 0.8; // Older entries slightly downweighted
  }

  /**
   * Compute overall recall confidence
   */
  private computeRecallConfidence(candidates: RecallMoment[]): number {
    if (candidates.length === 0) return 0.0;

    // Average rank score, normalized to 0-1
    const avgRank = candidates.reduce((a, b) => a + b.rank_score, 0) / candidates.length;
    return Math.min(1.0, avgRank);
  }

  /**
   * Build recall explanation
   */
  private buildRecallExplanation(
    intent: RecallIntent,
    confidence: number,
    matchCount: number
  ): string {
    const confidenceDesc = confidence >= 0.7 ? 'strong' : confidence >= 0.4 ? 'moderate' : 'loose';

    switch (intent) {
      case 'EMOTIONAL_RECALL':
        return `Found ${matchCount} moments with similar emotional patterns (${confidenceDesc} match)`;
      case 'TEMPORAL_RECALL':
        return `Found ${matchCount} related moments from your timeline (${confidenceDesc} match)`;
      case 'PATTERN_LOOKBACK':
        return `Found ${matchCount} moments that match this pattern (${confidenceDesc} match)`;
      default:
        return `Found ${matchCount} relevant moments (${confidenceDesc} match)`;
    }
  }

  /**
   * Format recall for chat with confidence-aware language
   */
  formatRecallForChat(recall: RecallResult): { text: string; moments: RecallMoment[]; footer?: string } {
    if (recall.phrasing === 'TENTATIVE') {
      return {
        text: 'This seems loosely similar to a few past moments.',
        moments: recall.moments,
        footer: 'This recall is tentative due to limited clarity.',
      };
    }

    return {
      text: 'This closely resembles past moments from these times.',
      moments: recall.moments,
    };
  }

  /**
   * Search EntryIR (LNC Phase 1)
   */
  private async searchIR(userId: string, query: string, limit: number): Promise<any[]> {
    try {
      // Search IR entries (Phase 3.6: Canon gating handled by contract)
      // Don't filter by canon here - let contract layer handle it
      const { data: irEntries, error } = await supabaseAdmin
        .from('entry_ir')
        .select('*')
        .eq('user_id', userId)
        .eq('compiler_flags->>is_deprecated', 'false')
        .limit(limit * 2); // Get more for filtering

      if (error || !irEntries || irEntries.length === 0) {
        return [];
      }

      // Filter by epistemic eligibility (Phase 2)
      const filtered = irEntries.filter((ir: any) => {
        const entryIR = ir as any;
        return epistemicTypeChecker.isRecallEligible(entryIR);
      });

      // Rank by confidence × epistemic priority
      const ranked = filtered
        .map((ir: any) => {
          const epistemicPriority = ir.knowledge_type === 'EXPERIENCE' ? 1.0 : 
                                   ir.knowledge_type === 'FACT' ? 0.9 : 
                                   ir.knowledge_type === 'FEELING' ? 0.8 : 0.5;
          
          return {
            ...ir,
            rank_score: ir.confidence * epistemicPriority,
            similarity: 0.7, // Placeholder - would use actual embedding similarity
            id: ir.id,
            date: ir.timestamp,
            created_at: ir.timestamp,
            content: ir.content,
            summary: ir.content.substring(0, 200),
          };
        })
        .sort((a, b) => b.rank_score - a.rank_score)
        .slice(0, limit);

      return ranked;
    } catch (error) {
      logger.debug({ error }, 'Failed to search IR, falling back to regular search');
      return [];
    }
  }
}

export const memoryRecallEngine = new MemoryRecallEngine();

