import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  ConsolidationCandidate,
  ConsolidationResult,
  SimilarityScore,
  ConsolidationStrategy as Strategy,
} from './types';

/**
 * Determines consolidation strategy and executes consolidation
 */
export class ConsolidationStrategyService {
  /**
   * Determine consolidation strategy for candidates
   */
  determineStrategy(similarities: SimilarityScore[]): ConsolidationCandidate[] {
    const candidates: ConsolidationCandidate[] = [];
    const processed = new Set<string>();

    // Group similar entries
    const groups = this.groupSimilarEntries(similarities);

    for (const group of groups) {
      if (group.length < 2) continue;

      const entryIds = [...new Set(group.flatMap(s => [s.entry1_id, s.entry2_id]))];
      const key = entryIds.sort().join(',');

      if (processed.has(key)) continue;
      processed.add(key);

      // Determine strategy based on similarity types
      const strategy = this.selectStrategy(group);
      const confidence = this.calculateConfidence(group);
      const suggestedAction = this.generateSuggestedAction(strategy, group);

      candidates.push({
        entries: entryIds,
        similarity_scores: group,
        strategy,
        confidence,
        suggested_action: suggestedAction,
        metadata: {
          group_size: entryIds.length,
          similarity_types: [...new Set(group.map(s => s.similarity_type))],
        },
      });
    }

    return candidates;
  }

  /**
   * Execute consolidation
   */
  async executeConsolidation(
    userId: string,
    candidate: ConsolidationCandidate
  ): Promise<ConsolidationResult | null> {
    try {
      if (candidate.strategy === 'keep_separate' || candidate.strategy === 'flag') {
        logger.warn({ candidate }, 'Cannot consolidate with keep_separate or flag strategy');
        return null;
      }

      // Get all entries to consolidate
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .in('id', candidate.entries)
        .order('date', { ascending: true });

      if (error || !entries || entries.length < 2) {
        logger.error({ error }, 'Failed to fetch entries for consolidation');
        return null;
      }

      // Merge entries
      const merged = this.mergeEntries(entries, candidate.strategy);

      // Create consolidated entry
      const { data: consolidated, error: insertError } = await supabaseAdmin
        .from('journal_entries')
        .insert({
          user_id: userId,
          content: merged.content,
          date: merged.date,
          source: merged.source,
          tags: merged.tags,
          people: merged.people,
          mood: merged.mood,
          sentiment: merged.sentiment,
          embedding: merged.embedding,
          metadata: {
            ...merged.metadata,
            consolidated_from: candidate.entries,
            consolidation_strategy: candidate.strategy,
            consolidated_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (insertError || !consolidated) {
        logger.error({ error: insertError }, 'Failed to create consolidated entry');
        return null;
      }

      // Link original entries to consolidated entry (for reference)
      await supabaseAdmin
        .from('journal_entries')
        .update({
          metadata: {
            ...entries[0].metadata,
            consolidated_into: consolidated.id,
            consolidation_date: new Date().toISOString(),
          },
        })
        .in('id', candidate.entries);

      // Optionally delete or mark original entries as consolidated
      // For now, we'll keep them but mark them

      return {
        original_ids: candidate.entries,
        consolidated_id: consolidated.id,
        strategy: candidate.strategy,
        merged_content: merged.content,
        merged_metadata: merged.metadata,
        preserved_fields: Object.keys(merged),
      };
    } catch (error) {
      logger.error({ error, candidate }, 'Failed to execute consolidation');
      return null;
    }
  }

  /**
   * Group similar entries
   */
  private groupSimilarEntries(similarities: SimilarityScore[]): SimilarityScore[][] {
    const groups: SimilarityScore[][] = [];
    const entryMap = new Map<string, Set<string>>();

    // Build adjacency map
    for (const sim of similarities) {
      if (!entryMap.has(sim.entry1_id)) {
        entryMap.set(sim.entry1_id, new Set());
      }
      if (!entryMap.has(sim.entry2_id)) {
        entryMap.set(sim.entry2_id, new Set());
      }
      entryMap.get(sim.entry1_id)!.add(sim.entry2_id);
      entryMap.get(sim.entry2_id)!.add(sim.entry1_id);
    }

    // Find connected components
    const visited = new Set<string>();
    for (const [entryId] of entryMap) {
      if (visited.has(entryId)) continue;

      const group: SimilarityScore[] = [];
      const queue = [entryId];
      visited.add(entryId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = entryMap.get(current) || new Set();

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
            // Find similarity score for this pair
            const sim = similarities.find(
              s =>
                (s.entry1_id === current && s.entry2_id === neighbor) ||
                (s.entry1_id === neighbor && s.entry2_id === current)
            );
            if (sim) group.push(sim);
          }
        }
      }

      if (group.length > 0) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Select consolidation strategy
   */
  private selectStrategy(similarities: SimilarityScore[]): Strategy {
    // Check for exact duplicates
    const hasExact = similarities.some(s => s.similarity_type === 'exact');
    if (hasExact) return 'merge';

    // Check for near duplicates
    const hasNearDuplicate = similarities.some(s => s.similarity_type === 'near_duplicate');
    if (hasNearDuplicate) {
      const avgScore = similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length;
      if (avgScore >= 0.9) return 'merge';
      if (avgScore >= 0.8) return 'link';
    }

    // Check for semantic similarity
    const hasSemantic = similarities.some(s => s.similarity_type === 'semantic');
    if (hasSemantic) {
      const avgScore = similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length;
      if (avgScore >= 0.85) return 'link';
    }

    // Temporal proximity
    const hasTemporal = similarities.some(s => s.similarity_type === 'temporal_proximity');
    if (hasTemporal) {
      return 'link';
    }

    return 'flag'; // Flag for manual review
  }

  /**
   * Calculate confidence in consolidation
   */
  private calculateConfidence(similarities: SimilarityScore[]): number {
    if (similarities.length === 0) return 0;

    const avgScore = similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length;
    const avgConfidence = similarities.reduce((sum, s) => sum + s.confidence, 0) / similarities.length;

    return (avgScore + avgConfidence) / 2;
  }

  /**
   * Generate suggested action
   */
  private generateSuggestedAction(strategy: Strategy, similarities: SimilarityScore[]): string {
    switch (strategy) {
      case 'merge':
        return `Merge ${similarities.length + 1} entries into one (exact or near-duplicate)`;
      case 'link':
        return `Link ${similarities.length + 1} related entries (similar content)`;
      case 'flag':
        return `Flag ${similarities.length + 1} entries for manual review`;
      case 'keep_separate':
        return `Keep ${similarities.length + 1} entries separate (low similarity)`;
      default:
        return 'Review these entries';
    }
  }

  /**
   * Merge entries into one
   */
  private mergeEntries(entries: any[], strategy: Strategy): any {
    // Sort by date (oldest first)
    const sorted = [...entries].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Merge content
    const contents = sorted.map(e => e.content).filter(Boolean);
    const mergedContent = contents.join('\n\n---\n\n');

    // Merge tags
    const allTags = new Set<string>();
    sorted.forEach(e => {
      (e.tags || []).forEach((tag: string) => allTags.add(tag));
    });

    // Merge people
    const allPeople = new Set<string>();
    sorted.forEach(e => {
      (e.people || []).forEach((person: string) => allPeople.add(person));
    });

    // Use most recent embedding if available
    const embedding = sorted.find(e => e.embedding)?.embedding || null;

    // Use most recent mood/sentiment
    const mood = last.mood || first.mood || null;
    const sentiment = last.sentiment !== null ? last.sentiment : first.sentiment;

    return {
      content: mergedContent,
      date: first.date, // Use earliest date
      source: first.source || 'consolidated',
      tags: Array.from(allTags),
      people: Array.from(allPeople),
      mood,
      sentiment,
      embedding,
      metadata: {
        original_count: entries.length,
        original_ids: entries.map(e => e.id),
        consolidation_date: new Date().toISOString(),
        consolidation_strategy: strategy,
      },
    };
  }
}

