import { Intervention, InterventionContext } from '../types';

/**
 * Detects mood spirals (declining emotional trajectory)
 */
export class MoodSpiralDetector {
  detect(ctx: InterventionContext): Intervention[] {
    const interventions: Intervention[] = [];

    try {
      // Check identity pulse for sentiment trend
      const sentimentTrend = ctx.identityPulse?.sentimentTrend || [];
      const recentSentiment = ctx.identityPulse?.recentSentiment || [];

      if (sentimentTrend.length < 3 && recentSentiment.length < 3) {
        return interventions;
      }

      // Use recent sentiment if available, otherwise use trend
      const moodData = recentSentiment.length >= 3 ? recentSentiment : sentimentTrend.slice(-5);
      const last3 = moodData.slice(-3);

      // Check for downward spiral (each value lower than previous)
      const isDownward = last3.every((v: number, i: number) => 
        i === 0 || v < last3[i - 1]
      );

      if (isDownward) {
        const avgDecline = (last3[0] - last3[last3.length - 1]) / 2;
        const severity = avgDecline > 0.5 ? 'high' : avgDecline > 0.3 ? 'medium' : 'low';

        interventions.push({
          id: crypto.randomUUID(),
          type: 'mood_spiral',
          severity: severity as any,
          confidence: 0.75,
          message: 'Your emotional trajectory has been declining over recent entries. Consider reflecting on what\'s driving this shift.',
          timestamp: new Date().toISOString(),
          context: {
            sentiment_values: last3,
            decline_magnitude: avgDecline,
          },
        });
      }

      // Check for critical low mood
      const currentMood = moodData[moodData.length - 1];
      if (currentMood < -0.7) {
        interventions.push({
          id: crypto.randomUUID(),
          type: 'mood_spiral',
          severity: 'critical',
          confidence: 0.9,
          message: 'Your mood has reached a critically low point. Consider reaching out for support or engaging in self-care activities.',
          timestamp: new Date().toISOString(),
          context: {
            current_sentiment: currentMood,
          },
        });
      }
    } catch (error) {
      // Silently fail - don't break intervention processing
    }

    return interventions;
  }
}

