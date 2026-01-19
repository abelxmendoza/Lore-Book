import { logger } from '../../logger';

import type { Scene } from './types';

/**
 * Normalizes scene data (clean up fields, validate types)
 */
export class SceneNormalizer {
  private readonly validTypes = [
    'social',
    'fight',
    'nightlife',
    'work',
    'training',
    'family',
    'romantic',
    'general',
  ];

  /**
   * Normalize scene data
   */
  normalize(scene: Scene): Scene {
    try {
      return {
        ...scene,
        type: this.validTypes.includes(scene.type?.toLowerCase())
          ? scene.type.toLowerCase()
          : 'general',
        mood: scene.mood?.toLowerCase() || 'neutral',
        outcome: scene.outcome?.trim() || '',
        title: scene.title?.trim() || 'Untitled Scene',
        setting: scene.setting?.trim() || 'Unknown',
        timeContext: scene.timeContext?.trim() || 'Unknown',
        summary: scene.summary?.trim() || '',
        // Ensure arrays are valid
        emotionalArc: Array.isArray(scene.emotionalArc) ? scene.emotionalArc : [],
        beats: Array.isArray(scene.beats) ? scene.beats : [],
        characters: Array.isArray(scene.characters) ? scene.characters : [],
        interactions: Array.isArray(scene.interactions) ? scene.interactions : [],
      };
    } catch (error) {
      logger.error({ error, scene }, 'Error normalizing scene');
      return scene;
    }
  }
}

