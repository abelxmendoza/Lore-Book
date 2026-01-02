import { logger } from '../../logger';
import type { EmotionType, EmotionalEvent, EmotionalPatternSummary } from './types';

/**
 * Analyzes emotional patterns from events
 */
export function analyzePatterns(events: EmotionalEvent[]): EmotionalPatternSummary {
  try {
    if (events.length === 0) {
      return {
        dominantEmotions: [],
        recurringTriggers: [],
        reactionLoops: {},
        recoverySpeed: 0,
        volatilityScore: 0,
        emotionalBiases: {},
      };
    }

    // 1. Dominant emotions (top 3 by frequency)
    const emotionCounts = new Map<EmotionType, number>();
    for (const event of events) {
      emotionCounts.set(event.emotion, (emotionCounts.get(event.emotion) || 0) + 1);
    }
    const dominantEmotions = Array.from(emotionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emotion]) => emotion);

    // 2. Recurring triggers (top 5 by frequency)
    const triggerCounts = new Map<string, number>();
    for (const event of events) {
      if (event.trigger) {
        triggerCounts.set(event.trigger, (triggerCounts.get(event.trigger) || 0) + 1);
      }
    }
    const recurringTriggers = Array.from(triggerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trigger]) => trigger);

    // 3. Reaction loops (emotion → behavior patterns)
    const reactionLoops: Record<string, any> = {};
    const loopMap = new Map<string, number>();

    for (const event of events) {
      if (event.emotion && event.behaviorResponse) {
        const loop = `${event.emotion} → ${event.behaviorResponse}`;
        loopMap.set(loop, (loopMap.get(loop) || 0) + 1);
      }
    }

    for (const [loop, count] of loopMap.entries()) {
      if (count >= 2) {
        // Only include loops that occur 2+ times
        reactionLoops[loop] = count;
      }
    }

    // 4. Recovery speed (average hours between events of same emotion)
    let recoverySpeed = 0;
    if (events.length > 1) {
      const sortedEvents = [...events].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );

      const recoveryTimes: number[] = [];
      for (let i = 1; i < sortedEvents.length; i++) {
        const prev = sortedEvents[i - 1];
        const curr = sortedEvents[i];

        if (prev.emotion === curr.emotion) {
          const timeDiff =
            (new Date(curr.created_at || 0).getTime() - new Date(prev.created_at || 0).getTime()) /
            (1000 * 60 * 60); // hours
          recoveryTimes.push(timeDiff);
        }
      }

      if (recoveryTimes.length > 0) {
        recoverySpeed = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
      }
    }

    // 5. Volatility score (0-1, based on intensity variance and frequency)
    const intensities = events.map((e) => e.intensity || 5);
    const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
    const variance =
      intensities.reduce((sum, i) => sum + Math.pow(i - avgIntensity, 2), 0) / intensities.length;
    const volatilityScore = Math.min(1, variance / 25); // Normalize to 0-1

    // 6. Emotional biases (first emotion in sequences)
    const emotionalBiases: Record<string, any> = {};
    const firstEmotionCounts = new Map<EmotionType, number>();

    // Group events by day and find first emotion of each day
    const eventsByDay = new Map<string, EmotionalEvent[]>();
    for (const event of events) {
      if (event.created_at) {
        const day = new Date(event.created_at).toISOString().split('T')[0];
        if (!eventsByDay.has(day)) {
          eventsByDay.set(day, []);
        }
        eventsByDay.get(day)!.push(event);
      }
    }

    for (const dayEvents of eventsByDay.values()) {
      const sorted = dayEvents.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      if (sorted.length > 0) {
        const firstEmotion = sorted[0].emotion;
        firstEmotionCounts.set(firstEmotion, (firstEmotionCounts.get(firstEmotion) || 0) + 1);
      }
    }

    // Identify biases (emotions that appear first frequently)
    for (const [emotion, count] of firstEmotionCounts.entries()) {
      const totalDays = eventsByDay.size;
      if (count / totalDays > 0.2) {
        // If emotion appears first in >20% of days, it's a bias
        emotionalBiases[emotion] = {
          frequency: count,
          percentage: (count / totalDays) * 100,
        };
      }
    }

    return {
      dominantEmotions,
      recurringTriggers,
      reactionLoops,
      recoverySpeed,
      volatilityScore,
      emotionalBiases,
    };
  } catch (error) {
    logger.error({ error }, 'Error analyzing patterns');
    return {
      dominantEmotions: [],
      recurringTriggers: [],
      reactionLoops: {},
      recoverySpeed: 0,
      volatilityScore: 0,
      emotionalBiases: {},
    };
  }
}

