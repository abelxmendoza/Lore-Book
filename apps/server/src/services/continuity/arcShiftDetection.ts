import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Arc Shift Detection Service
 * Detects when user enters a new life chapter based on topic shifts, novelty, and major events
 */
class ArcShiftDetectionService {
  private readonly NOVELTY_THRESHOLD = 0.55; // Novelty score threshold
  private readonly TOPIC_SHIFT_THRESHOLD = 0.4; // 40% topic shift
  private readonly WINDOW_DAYS = 30; // Previous window for comparison

  /**
   * Detect arc shifts
   */
  async detectArcShifts(
    recentComponents: MemoryComponent[],
    userId: string
  ): Promise<Array<{
    event_type: 'arc_shift';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const arcShifts: Array<{
      event_type: 'arc_shift';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (recentComponents.length < 5) {
      return arcShifts;
    }

    // 1. Get historical components for comparison
    const historicalComponents = await this.getHistoricalComponents(userId, this.WINDOW_DAYS);

    if (historicalComponents.length === 0) {
      return arcShifts;
    }

    // 2. Calculate novelty score
    const noveltyScore = await this.calculateNoveltyScore(recentComponents, historicalComponents);

    if (noveltyScore >= this.NOVELTY_THRESHOLD) {
      arcShifts.push({
        event_type: 'arc_shift',
        description: `New arc detected: High novelty score (${noveltyScore.toFixed(2)}) indicates significant life change`,
        source_components: recentComponents.slice(0, 10).map(c => c.id),
        severity: this.calculateSeverity(noveltyScore),
        metadata: {
          novelty_score: noveltyScore,
          method: 'novelty_scoring',
          recent_component_count: recentComponents.length,
        },
      });
    }

    // 3. Detect topic shift
    const topicShift = await this.detectTopicShift(recentComponents, historicalComponents);

    if (topicShift.shiftPercentage >= this.TOPIC_SHIFT_THRESHOLD) {
      arcShifts.push({
        event_type: 'arc_shift',
        description: `Arc shift detected: Topic shift of ${(topicShift.shiftPercentage * 100).toFixed(0)}% (from "${topicShift.oldTopic}" to "${topicShift.newTopic}")`,
        source_components: recentComponents.slice(0, 10).map(c => c.id),
        severity: this.calculateSeverity(topicShift.shiftPercentage),
        metadata: {
          shift_percentage: topicShift.shiftPercentage,
          old_topic: topicShift.oldTopic,
          new_topic: topicShift.newTopic,
          method: 'topic_shift',
        },
      });
    }

    // 4. Detect major life events
    const majorEvents = this.detectMajorLifeEvents(recentComponents);

    for (const event of majorEvents) {
      arcShifts.push({
        event_type: 'arc_shift',
        description: `Major life event detected: ${event.description}`,
        source_components: [event.componentId],
        severity: event.severity,
        metadata: {
          event_type: event.type,
          method: 'major_event',
        },
      });
    }

    // 5. Detect high-emotion clusters
    const emotionClusters = await this.detectHighEmotionClusters(recentComponents);

    for (const cluster of emotionClusters) {
      arcShifts.push({
        event_type: 'arc_shift',
        description: `New emotional arc detected: ${cluster.emotion} cluster with ${cluster.size} components`,
        source_components: cluster.componentIds,
        severity: cluster.severity,
        metadata: {
          emotion: cluster.emotion,
          cluster_size: cluster.size,
          method: 'emotion_cluster',
        },
      });
    }

    return arcShifts;
  }

  /**
   * Get historical components for comparison
   */
  private async getHistoricalComponents(
    userId: string,
    daysBack: number
  ): Promise<MemoryComponent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get entries from previous window
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .gte('date', cutoffDate.toISOString())
      .lt('date', new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    if (!entries || entries.length === 0) {
      return [];
    }

    const entryIds = entries.map(e => e.id);

    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in('journal_entry_id', entryIds)
      .limit(200);

    return (components || []) as MemoryComponent[];
  }

  /**
   * Calculate novelty score
   */
  private async calculateNoveltyScore(
    recentComponents: MemoryComponent[],
    historicalComponents: MemoryComponent[]
  ): Promise<number> {
    if (historicalComponents.length === 0) return 1.0;

    // Calculate centroid of historical components
    const historicalEmbeddings = historicalComponents
      .filter(c => c.embedding)
      .map(c => c.embedding!);

    if (historicalEmbeddings.length === 0) return 1.0;

    const historicalCentroid = this.calculateCentroid(historicalEmbeddings);
    if (!historicalCentroid) return 1.0;

    // Calculate max similarity of recent components to historical centroid
    let maxSimilarity = 0;

    for (const component of recentComponents) {
      if (!component.embedding) continue;

      const similarity = this.cosineSimilarity(component.embedding, historicalCentroid);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    // Novelty = 1 - max similarity
    return 1 - maxSimilarity;
  }

  /**
   * Detect topic shift
   */
  private async detectTopicShift(
    recentComponents: MemoryComponent[],
    historicalComponents: MemoryComponent[]
  ): Promise<{
    shiftPercentage: number;
    oldTopic: string;
    newTopic: string;
  }> {
    // Extract topics from components using tags and keywords
    const historicalTopics = this.extractTopics(historicalComponents);
    const recentTopics = this.extractTopics(recentComponents);

    // Calculate topic overlap
    const overlap = this.calculateTopicOverlap(historicalTopics, recentTopics);
    const shiftPercentage = 1 - overlap;

    // Get dominant topics
    const oldTopic = this.getDominantTopic(historicalTopics);
    const newTopic = this.getDominantTopic(recentTopics);

    return {
      shiftPercentage,
      oldTopic,
      newTopic,
    };
  }

  /**
   * Extract topics from components
   */
  private extractTopics(components: MemoryComponent[]): Map<string, number> {
    const topics = new Map<string, number>();

    for (const component of components) {
      // Use tags
      for (const tag of component.tags) {
        topics.set(tag, (topics.get(tag) || 0) + 1);
      }

      // Extract keywords from text
      const keywords = this.extractKeywords(component.text);
      for (const keyword of keywords) {
        topics.set(keyword, (topics.get(keyword) || 0) + 1);
      }
    }

    return topics;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those']);

    return words
      .filter(w => w.length > 3 && !stopWords.has(w))
      .slice(0, 10);
  }

  /**
   * Calculate topic overlap
   */
  private calculateTopicOverlap(
    topics1: Map<string, number>,
    topics2: Map<string, number>
  ): number {
    if (topics1.size === 0 || topics2.size === 0) return 0;

    let overlap = 0;
    let total = 0;

    // Calculate intersection
    for (const [topic, count1] of topics1.entries()) {
      const count2 = topics2.get(topic) || 0;
      overlap += Math.min(count1, count2);
      total += Math.max(count1, count2);
    }

    // Add topics only in topics2
    for (const [topic, count2] of topics2.entries()) {
      if (!topics1.has(topic)) {
        total += count2;
      }
    }

    return total === 0 ? 0 : overlap / total;
  }

  /**
   * Get dominant topic
   */
  private getDominantTopic(topics: Map<string, number>): string {
    if (topics.size === 0) return 'unknown';

    let maxCount = 0;
    let dominantTopic = 'unknown';

    for (const [topic, count] of topics.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantTopic = topic;
      }
    }

    return dominantTopic;
  }

  /**
   * Detect major life events
   */
  private detectMajorLifeEvents(
    components: MemoryComponent[]
  ): Array<{
    type: string;
    description: string;
    componentId: string;
    severity: number;
  }> {
    const events: Array<{
      type: string;
      description: string;
      componentId: string;
      severity: number;
    }> = [];

    const eventPatterns = [
      {
        keywords: ['job', 'work', 'career', 'employment', 'hired', 'fired', 'quit', 'resigned'],
        type: 'job_change',
        description: 'Job or career change',
        severity: 8,
      },
      {
        keywords: ['relationship', 'partner', 'dating', 'married', 'divorced', 'breakup', 'together'],
        type: 'relationship_change',
        description: 'Relationship status change',
        severity: 9,
      },
      {
        keywords: ['move', 'moved', 'relocated', 'new home', 'apartment', 'house'],
        type: 'location_change',
        description: 'Location or residence change',
        severity: 7,
      },
      {
        keywords: ['crisis', 'emergency', 'urgent', 'critical', 'serious', 'problem'],
        type: 'crisis',
        description: 'Crisis or emergency situation',
        severity: 10,
      },
      {
        keywords: ['health', 'illness', 'sick', 'hospital', 'doctor', 'medical'],
        type: 'health_event',
        description: 'Significant health event',
        severity: 8,
      },
    ];

    for (const component of components) {
      const text = component.text.toLowerCase();

      for (const pattern of eventPatterns) {
        const matches = pattern.keywords.filter(keyword => text.includes(keyword));
        if (matches.length >= 2) {
          events.push({
            type: pattern.type,
            description: pattern.description,
            componentId: component.id,
            severity: pattern.severity,
          });
          break; // Only one event type per component
        }
      }
    }

    return events;
  }

  /**
   * Detect high-emotion clusters
   */
  private async detectHighEmotionClusters(
    components: MemoryComponent[]
  ): Promise<Array<{
    emotion: string;
    size: number;
    componentIds: string[];
    severity: number;
  }>> {
    const clusters: Array<{
      emotion: string;
      size: number;
      componentIds: string[];
      severity: number;
    }> = [];

    // Simple emotion detection using keywords
    const emotionKeywords: Record<string, string[]> = {
      happy: ['happy', 'joy', 'excited', 'thrilled', 'delighted', 'elated'],
      sad: ['sad', 'depressed', 'down', 'upset', 'disappointed', 'melancholy'],
      angry: ['angry', 'mad', 'furious', 'irritated', 'annoyed', 'frustrated'],
      anxious: ['anxious', 'worried', 'nervous', 'stressed', 'overwhelmed', 'panic'],
      calm: ['calm', 'peaceful', 'relaxed', 'serene', 'tranquil', 'content'],
    };

    const emotionGroups: Record<string, MemoryComponent[]> = {};

    for (const component of components) {
      const text = component.text.toLowerCase();

      for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        const matches = keywords.filter(keyword => text.includes(keyword));
        if (matches.length > 0) {
          if (!emotionGroups[emotion]) {
            emotionGroups[emotion] = [];
          }
          emotionGroups[emotion].push(component);
          break;
        }
      }
    }

    // Find clusters with significant size
    for (const [emotion, group] of Object.entries(emotionGroups)) {
      if (group.length >= 3) {
        clusters.push({
          emotion,
          size: group.length,
          componentIds: group.map(c => c.id),
          severity: Math.min(10, group.length),
        });
      }
    }

    return clusters;
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
   * Calculate severity
   */
  private calculateSeverity(score: number): number {
    return Math.max(1, Math.min(10, Math.round(score * 10)));
  }
}

export const arcShiftDetectionService = new ArcShiftDetectionService();

