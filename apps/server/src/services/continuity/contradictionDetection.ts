import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Contradiction Detection Service
 * Detects inconsistencies in user statements using semantic clustering and keyword rules
 */
class ContradictionDetectionService {
  private readonly CONTRADICTION_THRESHOLD = 0.45; // Cosine similarity threshold
  private readonly MIN_CLUSTER_SIZE = 2; // Minimum components in cluster

  /**
   * Detect contradictions in memory components
   */
  async detectContradictions(
    components: MemoryComponent[],
    userId: string
  ): Promise<Array<{
    event_type: 'contradiction';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const contradictions: Array<{
      event_type: 'contradiction';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (components.length < 2) {
      return contradictions;
    }

    // 1. Semantic clustering - group related statements
    const clusters = await this.buildSemanticClusters(components);

    // 2. Check for contradictions within clusters
    for (const cluster of clusters) {
      if (cluster.components.length < 2) continue;

      const clusterContradictions = await this.checkClusterContradictions(cluster);
      contradictions.push(...clusterContradictions);
    }

    // 3. Keyword-based contradiction detection
    const keywordContradictions = this.detectKeywordContradictions(components);
    contradictions.push(...keywordContradictions);

    return contradictions;
  }

  /**
   * Build semantic clusters of related components
   */
  private async buildSemanticClusters(
    components: MemoryComponent[]
  ): Promise<Array<{ components: MemoryComponent[]; centroid: number[] | null }>> {
    const clusters: Array<{ components: MemoryComponent[]; centroid: number[] | null }> = [];
    const processed = new Set<string>();

    for (const component of components) {
      if (processed.has(component.id) || !component.embedding) continue;

      const cluster: MemoryComponent[] = [component];
      processed.add(component.id);

      // Find similar components
      for (const other of components) {
        if (
          processed.has(other.id) ||
          !other.embedding ||
          component.id === other.id
        ) {
          continue;
        }

        const similarity = this.cosineSimilarity(component.embedding, other.embedding);

        // Group if similarity is high (same topic)
        if (similarity > 0.6) {
          cluster.push(other);
          processed.add(other.id);
        }
      }

      if (cluster.length >= this.MIN_CLUSTER_SIZE) {
        // Calculate centroid
        const centroid = this.calculateCentroid(cluster.map(c => c.embedding!).filter(e => e));
        clusters.push({ components: cluster, centroid });
      }
    }

    return clusters;
  }

  /**
   * Check for contradictions within a cluster
   */
  private async checkClusterContradictions(cluster: {
    components: MemoryComponent[];
    centroid: number[] | null;
  }): Promise<Array<{
    event_type: 'contradiction';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const contradictions: Array<{
      event_type: 'contradiction';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (!cluster.centroid || cluster.components.length < 2) {
      return contradictions;
    }

    // Compare each component to cluster centroid
    for (const component of cluster.components) {
      if (!component.embedding) continue;

      const similarity = this.cosineSimilarity(component.embedding, cluster.centroid);

      // If component is semantically distant from cluster but same topic → contradiction
      if (similarity < this.CONTRADICTION_THRESHOLD) {
        // Check if topics are similar (using tags or text keywords)
        const topicSimilar = this.checkTopicSimilarity(component, cluster.components);

        if (topicSimilar) {
          const otherComponents = cluster.components
            .filter(c => c.id !== component.id)
            .map(c => c.id);

          contradictions.push({
            event_type: 'contradiction',
            description: `Contradiction detected: "${component.text.slice(0, 100)}" contradicts previous statements`,
            source_components: [component.id, ...otherComponents],
            severity: this.calculateSeverity(similarity),
            metadata: {
              similarity,
              method: 'semantic_cluster',
              component_text: component.text.slice(0, 200),
            },
          });
        }
      }
    }

    return contradictions;
  }

  /**
   * Detect contradictions using keyword patterns
   */
  private detectKeywordContradictions(
    components: MemoryComponent[]
  ): Array<{
    event_type: 'contradiction';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }> {
    const contradictions: Array<{
      event_type: 'contradiction';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    // Pattern 1: "I don't want to X" vs "I'm doing X"
    const negativePattern = /\b(i\s+)?(don'?t|do\s+not|won'?t|will\s+not)\s+want\s+to\s+(\w+)/gi;
    const positivePattern = /\b(i'?m|i\s+am|i'?m\s+doing|i\s+am\s+doing)\s+(\w+)/gi;

    const negativeStatements: Array<{ component: MemoryComponent; action: string }> = [];
    const positiveStatements: Array<{ component: MemoryComponent; action: string }> = [];

    for (const component of components) {
      const text = component.text.toLowerCase();

      // Extract negative statements
      const negativeMatches = text.match(negativePattern);
      if (negativeMatches) {
        for (const match of negativeMatches) {
          const actionMatch = match.match(/\b(want\s+to\s+)?(\w+)/i);
          if (actionMatch) {
            negativeStatements.push({
              component,
              action: actionMatch[2],
            });
          }
        }
      }

      // Extract positive statements
      const positiveMatches = text.match(positivePattern);
      if (positiveMatches) {
        for (const match of positiveMatches) {
          const actionMatch = match.match(/\b(doing|am)\s+(\w+)/i);
          if (actionMatch) {
            positiveStatements.push({
              component,
              action: actionMatch[2],
            });
          }
        }
      }
    }

    // Check for contradictions
    for (const negative of negativeStatements) {
      for (const positive of positiveStatements) {
        // Check if actions are similar
        if (
          this.areActionsSimilar(negative.action, positive.action) &&
          negative.component.id !== positive.component.id
        ) {
          // Check temporal order (negative should come before positive)
          const negativeTime = new Date(negative.component.timestamp || negative.component.created_at || 0).getTime();
          const positiveTime = new Date(positive.component.timestamp || positive.component.created_at || 0).getTime();

          if (negativeTime < positiveTime) {
            contradictions.push({
              event_type: 'contradiction',
              description: `Contradiction: Previously stated "don't want to ${negative.action}" but later doing it`,
              source_components: [negative.component.id, positive.component.id],
              severity: 7,
              metadata: {
                method: 'keyword_pattern',
                negative_action: negative.action,
                positive_action: positive.action,
              },
            });
          }
        }
      }
    }

    // Pattern 2: "I'll never..." vs later doing it
    const neverPattern = /\b(i'?ll|i\s+will)\s+never\s+(\w+)/gi;
    const neverStatements: Array<{ component: MemoryComponent; action: string }> = [];

    for (const component of components) {
      const text = component.text.toLowerCase();
      const matches = text.match(neverPattern);
      if (matches) {
        for (const match of matches) {
          const actionMatch = match.match(/\bnever\s+(\w+)/i);
          if (actionMatch) {
            neverStatements.push({
              component,
              action: actionMatch[1],
            });
          }
        }
      }
    }

    // Check if "never" actions were later done
    for (const neverStmt of neverStatements) {
      for (const positive of positiveStatements) {
        if (
          this.areActionsSimilar(neverStmt.action, positive.action) &&
          neverStmt.component.id !== positive.component.id
        ) {
          const neverTime = new Date(neverStmt.component.timestamp || neverStmt.component.created_at || 0).getTime();
          const positiveTime = new Date(positive.component.timestamp || positive.component.created_at || 0).getTime();

          if (neverTime < positiveTime) {
            contradictions.push({
              event_type: 'contradiction',
              description: `Contradiction: Previously said "never ${neverStmt.action}" but later doing it`,
              source_components: [neverStmt.component.id, positive.component.id],
              severity: 8,
              metadata: {
                method: 'keyword_pattern',
                never_action: neverStmt.action,
                positive_action: positive.action,
              },
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Check if two components have similar topics
   */
  private checkTopicSimilarity(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): boolean {
    // Use tags if available
    if (component.tags.length > 0) {
      for (const other of otherComponents) {
        if (other.tags.length > 0) {
          const sharedTags = component.tags.filter(t => other.tags.includes(t));
          if (sharedTags.length > 0) {
            return true;
          }
        }
      }
    }

    // Use keyword extraction from text
    const componentKeywords = this.extractKeywords(component.text);
    for (const other of otherComponents) {
      const otherKeywords = this.extractKeywords(other.text);
      const sharedKeywords = componentKeywords.filter(k => otherKeywords.includes(k));
      if (sharedKeywords.length >= 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract keywords from text (simple approach)
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);
    
    return words
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 10);
  }

  /**
   * Check if two actions are similar
   */
  private areActionsSimilar(action1: string, action2: string): boolean {
    const a1 = action1.toLowerCase();
    const a2 = action2.toLowerCase();

    // Exact match
    if (a1 === a2) return true;

    // Stemming (simple)
    const stem1 = a1.replace(/ing$|ed$|s$/, '');
    const stem2 = a2.replace(/ing$|ed$|s$/, '');

    if (stem1 === stem2) return true;

    // Levenshtein distance (simple)
    const distance = this.levenshteinDistance(a1, a2);
    const maxLen = Math.max(a1.length, a2.length);
    const similarity = 1 - distance / maxLen;

    return similarity > 0.7;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate centroid of embeddings
   */
  private calculateCentroid(embeddings: number[][]): number[] | null {
    if (embeddings.length === 0) return null;

    const dimension = embeddings[0].length;
    const centroid: number[] = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Calculate severity based on similarity
   */
  private calculateSeverity(similarity: number): number {
    // Lower similarity = higher severity
    const severity = Math.round((1 - similarity) * 10);
    return Math.max(1, Math.min(10, severity));
  }
}

export const contradictionDetectionService = new ContradictionDetectionService();

