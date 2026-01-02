import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';

/**
 * Emotional Arc Detection Service
 * Detects changes in emotional tone using sentiment analysis and moving averages
 */
class EmotionalArcDetectionService {
  private readonly MOVING_AVERAGE_WINDOW = 14; // 14 days
  private readonly SLOPE_THRESHOLD = 0.3; // Slope threshold for transition detection

  /**
   * Detect emotional arc transitions
   */
  async detectEmotionalArcs(
    components: MemoryComponent[]
  ): Promise<Array<{
    event_type: 'emotional_transition';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const transitions: Array<{
      event_type: 'emotional_transition';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    if (components.length < this.MOVING_AVERAGE_WINDOW) {
      return transitions;
    }

    // 1. Calculate sentiment scores for each component
    const sentimentScores = components.map(component => ({
      component,
      sentiment: this.calculateSentiment(component.text),
      timestamp: new Date(component.timestamp || component.created_at || 0).getTime(),
    }));

    // 2. Sort by timestamp
    sentimentScores.sort((a, b) => a.timestamp - b.timestamp);

    // 3. Calculate moving average
    const movingAverages = this.calculateMovingAverage(sentimentScores, this.MOVING_AVERAGE_WINDOW);

    // 4. Detect slope changes
    const slopeChanges = this.detectSlopeChanges(movingAverages);

    for (const change of slopeChanges) {
      const transitionType = change.slope > 0 ? 'recovery' : 'downturn';
      const severity = this.calculateSeverity(Math.abs(change.slope));

      transitions.push({
        event_type: 'emotional_transition',
        description: `Emotional ${transitionType} arc detected: ${transitionType === 'recovery' ? 'Improving' : 'Declining'} emotional state (slope: ${change.slope.toFixed(2)})`,
        source_components: change.componentIds,
        severity,
        metadata: {
          transition_type: transitionType,
          slope: change.slope,
          start_sentiment: change.startSentiment,
          end_sentiment: change.endSentiment,
          window_days: this.MOVING_AVERAGE_WINDOW,
          method: 'moving_average_slope',
        },
      });
    }

    // 5. Detect emotional loops (recurring patterns)
    const loops = this.detectEmotionalLoops(sentimentScores);

    for (const loop of loops) {
      transitions.push({
        event_type: 'emotional_transition',
        description: `Emotional loop detected: Recurring ${loop.pattern} pattern (${loop.occurrences} occurrences)`,
        source_components: loop.componentIds,
        severity: loop.severity,
        metadata: {
          pattern: loop.pattern,
          occurrences: loop.occurrences,
          method: 'pattern_detection',
        },
      });
    }

    return transitions;
  }

  /**
   * Calculate sentiment score (rule-based, can be enhanced with DistilBERT)
   */
  private calculateSentiment(text: string): number {
    // Returns -1 (negative) to 1 (positive)
    const lowerText = text.toLowerCase();

    // Positive keywords
    const positiveKeywords = [
      'happy', 'joy', 'excited', 'thrilled', 'delighted', 'elated', 'great', 'wonderful',
      'amazing', 'fantastic', 'love', 'enjoy', 'pleased', 'grateful', 'thankful', 'blessed',
      'content', 'peaceful', 'calm', 'relaxed', 'confident', 'proud', 'accomplished',
      'successful', 'achieved', 'progress', 'improving', 'better', 'good', 'nice', 'fine',
    ];

    // Negative keywords
    const negativeKeywords = [
      'sad', 'depressed', 'down', 'upset', 'disappointed', 'melancholy', 'terrible', 'awful',
      'horrible', 'hate', 'dislike', 'frustrated', 'angry', 'mad', 'furious', 'irritated',
      'anxious', 'worried', 'nervous', 'stressed', 'overwhelmed', 'panic', 'scared', 'afraid',
      'tired', 'exhausted', 'drained', 'burned out', 'stuck', 'struggling', 'difficult',
      'challenging', 'problem', 'issue', 'bad', 'worst', 'failed', 'failure',
    ];

    let score = 0;
    let totalMatches = 0;

    // Count positive matches
    for (const keyword of positiveKeywords) {
      const matches = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
      score += matches;
      totalMatches += matches;
    }

    // Count negative matches
    for (const keyword of negativeKeywords) {
      const matches = (lowerText.match(new RegExp(keyword, 'g')) || []).length;
      score -= matches;
      totalMatches += matches;
    }

    // Normalize to -1 to 1
    if (totalMatches === 0) return 0;
    return Math.max(-1, Math.min(1, score / totalMatches));
  }

  /**
   * Calculate moving average
   */
  private calculateMovingAverage(
    sentimentScores: Array<{ component: MemoryComponent; sentiment: number; timestamp: number }>,
    window: number
  ): Array<{
    component: MemoryComponent;
    sentiment: number;
    timestamp: number;
    movingAverage: number;
  }> {
    const result: Array<{
      component: MemoryComponent;
      sentiment: number;
      timestamp: number;
      movingAverage: number;
    }> = [];

    for (let i = 0; i < sentimentScores.length; i++) {
      const windowStart = Math.max(0, i - window + 1);
      const windowEnd = i + 1;
      const windowData = sentimentScores.slice(windowStart, windowEnd);

      const average = windowData.reduce((sum, item) => sum + item.sentiment, 0) / windowData.length;

      result.push({
        component: sentimentScores[i].component,
        sentiment: sentimentScores[i].sentiment,
        timestamp: sentimentScores[i].timestamp,
        movingAverage: average,
      });
    }

    return result;
  }

  /**
   * Detect slope changes in moving average
   */
  private detectSlopeChanges(
    movingAverages: Array<{
      component: MemoryComponent;
      sentiment: number;
      timestamp: number;
      movingAverage: number;
    }>
  ): Array<{
    slope: number;
    startSentiment: number;
    endSentiment: number;
    componentIds: string[];
  }> {
    const changes: Array<{
      slope: number;
      startSentiment: number;
      endSentiment: number;
      componentIds: string[];
    }> = [];

    if (movingAverages.length < this.MOVING_AVERAGE_WINDOW * 2) {
      return changes;
    }

    // Calculate slope over windows
    for (let i = this.MOVING_AVERAGE_WINDOW; i < movingAverages.length; i++) {
      const windowStart = i - this.MOVING_AVERAGE_WINDOW;
      const windowEnd = i;

      const startAvg = movingAverages[windowStart].movingAverage;
      const endAvg = movingAverages[windowEnd].movingAverage;
      const timeDiff = movingAverages[windowEnd].timestamp - movingAverages[windowStart].timestamp;
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      if (daysDiff > 0) {
        const slope = (endAvg - startAvg) / daysDiff;

        if (Math.abs(slope) >= this.SLOPE_THRESHOLD) {
          changes.push({
            slope,
            startSentiment: startAvg,
            endSentiment: endAvg,
            componentIds: movingAverages
              .slice(windowStart, windowEnd + 1)
              .map(ma => ma.component.id),
          });
        }
      }
    }

    return changes;
  }

  /**
   * Detect emotional loops (recurring patterns)
   */
  private detectEmotionalLoops(
    sentimentScores: Array<{ component: MemoryComponent; sentiment: number; timestamp: number }>
  ): Array<{
    pattern: string;
    occurrences: number;
    componentIds: string[];
    severity: number;
  }> {
    const loops: Array<{
      pattern: string;
      occurrences: number;
      componentIds: string[];
      severity: number;
    }> = [];

    // Detect patterns: high -> low -> high (cycle)
    const cycles: Array<{ start: number; end: number }> = [];
    let inHigh = false;
    let cycleStart = -1;

    for (let i = 0; i < sentimentScores.length; i++) {
      const sentiment = sentimentScores[i].sentiment;

      if (sentiment > 0.3 && !inHigh) {
        // Entering high
        inHigh = true;
        cycleStart = i;
      } else if (sentiment < -0.3 && inHigh) {
        // Dropped to low
        inHigh = false;
        if (cycleStart !== -1) {
          cycles.push({ start: cycleStart, end: i });
        }
      }
    }

    // Group cycles
    if (cycles.length >= 2) {
      loops.push({
        pattern: 'high-low cycle',
        occurrences: cycles.length,
        componentIds: cycles.flatMap(c =>
          sentimentScores.slice(c.start, c.end + 1).map(s => s.component.id)
        ),
        severity: Math.min(10, cycles.length),
      });
    }

    return loops;
  }

  /**
   * Calculate severity
   */
  private calculateSeverity(slopeMagnitude: number): number {
    return Math.max(1, Math.min(10, Math.round(slopeMagnitude * 20)));
  }
}

export const emotionalArcDetectionService = new EmotionalArcDetectionService();

