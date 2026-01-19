import { logger } from '../../logger';

import type { ArchetypeProfile, ArchetypeDistortion } from './types';

/**
 * Detects archetype distortions
 */
export class DistortionDetector {
  private readonly THRESHOLD_OVERDRIVE = 10.0; // High score threshold

  /**
   * Detect distortions in archetype profile
   */
  detect(profile: ArchetypeProfile): ArchetypeDistortion[] {
    const distortions: ArchetypeDistortion[] = [];

    try {
      const dominantScore = profile.distribution[profile.dominant] || 0;

      // Overdrive detection
      if (dominantScore > this.THRESHOLD_OVERDRIVE) {
        distortions.push({
          id: crypto.randomUUID(),
          user_id: profile.user_id,
          archetype: profile.dominant,
          distortion: 'Overdrive',
          confidence: 0.8,
          indicators: [`${profile.dominant} score (${dominantScore.toFixed(2)}) is unusually high`],
          timestamp: new Date().toISOString(),
          metadata: {
            dominant_score: dominantScore,
            threshold: this.THRESHOLD_OVERDRIVE,
          },
        });
      }

      // Identity Split detection (Warrior conflicts with Hermit or Shadow)
      const warriorScore = profile.distribution['Warrior'] || 0;
      const hermitScore = profile.distribution['Hermit'] || 0;
      const shadowScore = profile.distribution['Shadow_Self'] || 0;

      if (warriorScore > 5 && (hermitScore > 3 || shadowScore > 3)) {
        const conflictType = hermitScore > shadowScore ? 'Hermit' : 'Shadow_Self';
        const conflictScore = hermitScore > shadowScore ? hermitScore : shadowScore;

        distortions.push({
          id: crypto.randomUUID(),
          user_id: profile.user_id,
          archetype: 'Warrior',
          distortion: 'IdentitySplit',
          confidence: 0.7,
          indicators: [
            `Warrior (${warriorScore.toFixed(2)}) conflicts with ${conflictType} (${conflictScore.toFixed(2)})`,
          ],
          timestamp: new Date().toISOString(),
          metadata: {
            warrior_score: warriorScore,
            conflict_archetype: conflictType,
            conflict_score: conflictScore,
          },
        });
      }

      // Shadow Dominance detection
      if (profile.shadow && (profile.distribution[profile.shadow] || 0) > 5) {
        const shadowScore = profile.distribution[profile.shadow] || 0;
        distortions.push({
          id: crypto.randomUUID(),
          user_id: profile.user_id,
          archetype: profile.shadow,
          distortion: 'ShadowDominance',
          confidence: 0.75,
          indicators: [`Shadow archetype (${shadowScore.toFixed(2)}) is strongly present`],
          timestamp: new Date().toISOString(),
          metadata: {
            shadow_score: shadowScore,
          },
        });
      }

      logger.debug({ distortions: distortions.length }, 'Detected archetype distortions');

      return distortions;
    } catch (error) {
      logger.error({ error }, 'Failed to detect distortions');
      return [];
    }
  }
}

