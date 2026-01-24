import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import type { IdentitySignal, IdentityDimension } from './identityTypes';

/**
 * Builds identity dimensions from signals
 * Uses semantic clustering with embeddings for better dimension assignment
 */
export class IdentityDimensionBuilder {
  private readonly SIMILARITY_THRESHOLD = 0.75; // Cosine similarity threshold for clustering

  /**
   * Build dimensions from signals
   * Uses semantic clustering before pattern matching
   */
  async build(signals: IdentitySignal[]): Promise<IdentityDimension[]> {
    const dimensions: IdentityDimension[] = [];

    try {
      // Step 1: Cluster signals by semantic similarity (if embeddings available)
      const clusteredSignals = await this.clusterSignalsBySimilarity(signals);

      // Step 2: Build dimensions from clustered signals
      const addDim = (name: string, filter: (s: IdentitySignal) => boolean) => {
        const match = signals.filter(filter);
        if (match.length > 0) {
          // Use semantic similarity to improve scoring
          const score = this.calculateDimensionScore(match, clusteredSignals);
          dimensions.push({
            id: randomUUID(),
            name,
            score: Math.min(1, score),
            signals: match,
          });
        }
      };

      // Classic identity dimensions (pattern-based)
      addDim('Warrior', (s) => /fight|overcome|strength|battle|conquer|defeat/i.test(s.text));
      addDim('Creator', (s) => /build|create|invent|design|make|craft|art/i.test(s.text));
      addDim('Explorer', (s) => /explore|learn|curious|discover|adventure|journey|travel/i.test(s.text));
      addDim('Rebel', (s) => /break rules|against|not like others|defy|resist|challenge authority/i.test(s.text));
      addDim('Guardian', (s) => /protect|care|support|defend|nurture|help|save/i.test(s.text));
      addDim('Shadow', (s) => s.type === 'shadow');
      addDim('Sage', (s) => /wisdom|knowledge|teach|understand|insight|learned/i.test(s.text));
      addDim('Lover', (s) => /love|connection|intimacy|passion|romance|affection/i.test(s.text));
      addDim('Hero', (s) => /hero|save|rescue|help others|make a difference|impact/i.test(s.text));
      addDim('Seeker', (s) => /search|find|seek|quest|mission|purpose|meaning/i.test(s.text));

      // Step 3: Detect new dimensions dynamically from clusters
      const dynamicDimensions = await this.detectDynamicDimensions(clusteredSignals, signals);
      dimensions.push(...dynamicDimensions);

      logger.debug({ count: dimensions.length, dynamicCount: dynamicDimensions.length }, 'Built identity dimensions');
    } catch (error) {
      logger.error({ error }, 'Error building dimensions');
    }

    return dimensions;
  }

  /**
   * Cluster signals by semantic similarity using embeddings
   */
  private async clusterSignalsBySimilarity(signals: IdentitySignal[]): Promise<Map<string, IdentitySignal[]>> {
    const clusters = new Map<string, IdentitySignal[]>();

    try {
      // Only cluster signals that have embeddings
      const signalsWithEmbeddings = signals.filter(s => s.embedding && s.embedding.length > 0);
      
      if (signalsWithEmbeddings.length === 0) {
        return clusters; // No embeddings available
      }

      // Simple clustering: group signals with high similarity
      for (let i = 0; i < signalsWithEmbeddings.length; i++) {
        const signal1 = signalsWithEmbeddings[i];
        let assigned = false;

        // Try to find existing cluster
        for (const [clusterId, clusterSignals] of clusters.entries()) {
          const representative = clusterSignals[0];
          if (representative.embedding && signal1.embedding) {
            const similarity = this.cosineSimilarity(representative.embedding, signal1.embedding);
            if (similarity >= this.SIMILARITY_THRESHOLD) {
              clusterSignals.push(signal1);
              assigned = true;
              break;
            }
          }
        }

        // Create new cluster if no match found
        if (!assigned) {
          const clusterId = `cluster-${i}`;
          clusters.set(clusterId, [signal1]);
        }
      }

      logger.debug({ clusterCount: clusters.size, signalCount: signalsWithEmbeddings.length }, 'Clustered signals by similarity');
    } catch (error) {
      logger.debug({ error }, 'Failed to cluster signals, continuing without clustering');
    }

    return clusters;
  }

  /**
   * Calculate dimension score using semantic similarity
   */
  private calculateDimensionScore(
    matchedSignals: IdentitySignal[],
    clusters: Map<string, IdentitySignal[]>
  ): number {
    if (matchedSignals.length === 0) return 0;

    // Base score from signal count
    let score = Math.min(1, matchedSignals.length / 10);

    // Boost score if signals are semantically similar (in same cluster)
    let clusterBonus = 0;
    for (const clusterSignals of clusters.values()) {
      const clusterMatches = matchedSignals.filter(s => 
        clusterSignals.some(cs => cs.id === s.id)
      );
      if (clusterMatches.length > 1) {
        // Multiple signals in same cluster = stronger dimension
        clusterBonus += 0.1 * (clusterMatches.length - 1);
      }
    }

    return Math.min(1, score + clusterBonus);
  }

  /**
   * Detect new dimension types dynamically from signal clusters
   */
  private async detectDynamicDimensions(
    clusters: Map<string, IdentitySignal[]>,
    allSignals: IdentitySignal[]
  ): Promise<IdentityDimension[]> {
    const dynamicDimensions: IdentityDimension[] = [];

    try {
      // Find large clusters that don't match existing dimensions
      for (const [clusterId, clusterSignals] of clusters.entries()) {
        if (clusterSignals.length < 3) continue; // Need at least 3 signals for new dimension

        // Check if cluster matches existing dimension patterns
        const firstSignal = clusterSignals[0];
        const matchesExisting = this.matchesExistingDimension(firstSignal.text);
        
        if (!matchesExisting) {
          // Generate dimension name from cluster signals
          const dimensionName = await this.generateDimensionName(clusterSignals);
          if (dimensionName) {
            dynamicDimensions.push({
              id: randomUUID(),
              name: dimensionName,
              score: Math.min(1, clusterSignals.length / 10),
              signals: clusterSignals,
            });
          }
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to detect dynamic dimensions');
    }

    return dynamicDimensions;
  }

  /**
   * Check if signal text matches existing dimension patterns
   */
  private matchesExistingDimension(text: string): boolean {
    const existingPatterns = [
      /fight|overcome|strength|battle|conquer|defeat/i,
      /build|create|invent|design|make|craft|art/i,
      /explore|learn|curious|discover|adventure|journey|travel/i,
      /break rules|against|not like others|defy|resist|challenge authority/i,
      /protect|care|support|defend|nurture|help|save/i,
      /wisdom|knowledge|teach|understand|insight|learned/i,
      /love|connection|intimacy|passion|romance|affection/i,
      /hero|save|rescue|help others|make a difference|impact/i,
      /search|find|seek|quest|mission|purpose|meaning/i,
    ];

    return existingPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Generate dimension name from cluster signals using LLM
   */
  private async generateDimensionName(signals: IdentitySignal[]): Promise<string | null> {
    try {
      // Use first few signals to generate name
      const signalTexts = signals.slice(0, 5).map(s => s.text).join('\n');
      
      // For now, use simple extraction (can be enhanced with LLM later)
      // Extract common themes from signal texts
      const words = signalTexts.toLowerCase().split(/\s+/);
      const wordFreq = new Map<string, number>();
      
      for (const word of words) {
        if (word.length > 4 && !['that', 'this', 'with', 'from', 'about'].includes(word)) {
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
      }

      const topWords = Array.from(wordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

      return topWords.length > 0 ? topWords.join(' ') : null;
    } catch (error) {
      logger.debug({ error }, 'Failed to generate dimension name');
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

