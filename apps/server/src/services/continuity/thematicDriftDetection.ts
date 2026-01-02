import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';

/**
 * Thematic Drift Detection Service
 * Detects changing life themes using TF-IDF keywords and embedding clusters
 */
class ThematicDriftDetectionService {
  private readonly TOPIC_COUNT = 5; // Top N topics to track

  /**
   * Detect thematic drift
   */
  async detectThematicDrift(
    recentComponents: MemoryComponent[],
    historicalComponents: MemoryComponent[]
  ): Promise<Array<{
    event_type: 'thematic_drift';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const drifts: Array<{
      event_type: 'thematic_drift';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (recentComponents.length === 0 || historicalComponents.length === 0) {
      return drifts;
    }

    // 1. Extract topics using TF-IDF
    const recentTopics = this.extractTopicsTFIDF(recentComponents);
    const historicalTopics = this.extractTopicsTFIDF(historicalComponents);

    // 2. Compare dominant topics
    const recentTopTopics = this.getTopTopics(recentTopics, this.TOPIC_COUNT);
    const historicalTopTopics = this.getTopTopics(historicalTopics, this.TOPIC_COUNT);

    // 3. Detect topic changes
    const topicChanges = this.detectTopicChanges(recentTopTopics, historicalTopTopics);

    for (const change of topicChanges) {
      drifts.push({
        event_type: 'thematic_drift',
        description: `Thematic drift detected: Shift from "${change.oldTopic}" to "${change.newTopic}"`,
        source_components: [
          ...recentComponents.slice(0, 10).map(c => c.id),
          ...historicalComponents.slice(0, 10).map(c => c.id),
        ],
        severity: this.calculateSeverity(change.significance),
        metadata: {
          old_topic: change.oldTopic,
          new_topic: change.newTopic,
          significance: change.significance,
          old_topic_score: change.oldScore,
          new_topic_score: change.newScore,
          method: 'tfidf_comparison',
        },
      });
    }

    // 4. Detect embedding cluster shifts
    const clusterShifts = await this.detectClusterShifts(recentComponents, historicalComponents);

    for (const shift of clusterShifts) {
      drifts.push({
        event_type: 'thematic_drift',
        description: `Thematic cluster shift detected: New dominant cluster emerging`,
        source_components: shift.componentIds,
        severity: shift.severity,
        metadata: {
          cluster_similarity: shift.similarity,
          method: 'embedding_cluster',
        },
      });
    }

    return drifts;
  }

  /**
   * Extract topics using TF-IDF
   */
  private extractTopicsTFIDF(components: MemoryComponent[]): Map<string, number> {
    // Simple TF-IDF implementation
    const termFrequency: Map<string, number> = new Map();
    const documentFrequency: Map<string, number> = new Map();
    const totalDocs = components.length;

    // Calculate term frequency per document
    for (const component of components) {
      const terms = this.extractTerms(component.text);
      const docTerms = new Set<string>();

      for (const term of terms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
        if (!docTerms.has(term)) {
          documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
          docTerms.add(term);
        }
      }
    }

    // Calculate TF-IDF scores
    const tfidfScores: Map<string, number> = new Map();

    for (const [term, tf] of termFrequency.entries()) {
      const df = documentFrequency.get(term) || 1;
      const idf = Math.log(totalDocs / df);
      const tfidf = tf * idf;
      tfidfScores.set(term, tfidf);
    }

    return tfidfScores;
  }

  /**
   * Extract terms from text
   */
  private extractTerms(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this',
      'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him',
      'her', 'us', 'them',
    ]);

    return words
      .filter(w => w.length > 3 && !stopWords.has(w))
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => w.length > 0);
  }

  /**
   * Get top topics
   */
  private getTopTopics(topicScores: Map<string, number>, count: number): Array<{ topic: string; score: number }> {
    return Array.from(topicScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([topic, score]) => ({ topic, score }));
  }

  /**
   * Detect topic changes
   */
  private detectTopicChanges(
    recentTopics: Array<{ topic: string; score: number }>,
    historicalTopics: Array<{ topic: string; score: number }>
  ): Array<{
    oldTopic: string;
    newTopic: string;
    oldScore: number;
    newScore: number;
    significance: number;
  }> {
    const changes: Array<{
      oldTopic: string;
      newTopic: string;
      oldScore: number;
      newScore: number;
      significance: number;
    }> = [];

    if (recentTopics.length === 0 || historicalTopics.length === 0) {
      return changes;
    }

    const historicalTopTopic = historicalTopics[0];
    const recentTopTopic = recentTopics[0];

    // Check if top topic changed
    if (historicalTopTopic.topic !== recentTopTopic.topic) {
      const significance = Math.abs(recentTopTopic.score - historicalTopTopic.score) / Math.max(recentTopTopic.score, historicalTopTopic.score);

      if (significance > 0.2) {
        changes.push({
          oldTopic: historicalTopTopic.topic,
          newTopic: recentTopTopic.topic,
          oldScore: historicalTopTopic.score,
          newScore: recentTopTopic.score,
          significance,
        });
      }
    }

    // Check for topics that disappeared or appeared
    const historicalTopicSet = new Set(historicalTopics.map(t => t.topic));
    const recentTopicSet = new Set(recentTopics.map(t => t.topic));

    // Topics that disappeared
    for (const historicalTopic of historicalTopics.slice(0, 3)) {
      if (!recentTopicSet.has(historicalTopic.topic)) {
        const newTopic = recentTopics.find(t => !historicalTopicSet.has(t.topic));
        if (newTopic) {
          changes.push({
            oldTopic: historicalTopic.topic,
            newTopic: newTopic.topic,
            oldScore: historicalTopic.score,
            newScore: newTopic.score,
            significance: 0.5,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Detect embedding cluster shifts
   */
  private async detectClusterShifts(
    recentComponents: MemoryComponent[],
    historicalComponents: MemoryComponent[]
  ): Promise<Array<{
    similarity: number;
    componentIds: string[];
    severity: number;
  }>> {
    const shifts: Array<{
      similarity: number;
      componentIds: string[];
      severity: number;
    }> = [];

    // Calculate centroids
    const recentEmbeddings = recentComponents.filter(c => c.embedding).map(c => c.embedding!);
    const historicalEmbeddings = historicalComponents.filter(c => c.embedding).map(c => c.embedding!);

    if (recentEmbeddings.length === 0 || historicalEmbeddings.length === 0) {
      return shifts;
    }

    const recentCentroid = this.calculateCentroid(recentEmbeddings);
    const historicalCentroid = this.calculateCentroid(historicalEmbeddings);

    if (!recentCentroid || !historicalCentroid) {
      return shifts;
    }

    const similarity = this.cosineSimilarity(recentCentroid, historicalCentroid);

    // If similarity is low, cluster has shifted
    if (similarity < 0.6) {
      shifts.push({
        similarity,
        componentIds: [
          ...recentComponents.slice(0, 10).map(c => c.id),
          ...historicalComponents.slice(0, 10).map(c => c.id),
        ],
        severity: this.calculateSeverity(1 - similarity),
      });
    }

    return shifts;
  }

  /**
   * Calculate centroid
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
   * Calculate cosine similarity
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
   * Calculate severity
   */
  private calculateSeverity(significance: number): number {
    return Math.max(1, Math.min(10, Math.round(significance * 10)));
  }
}

export const thematicDriftDetectionService = new ThematicDriftDetectionService();

