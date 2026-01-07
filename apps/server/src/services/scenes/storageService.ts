import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Scene, SceneCharacter } from './types';

/**
 * Storage service for scenes
 */
export class SceneStorage {
  /**
   * Save a scene and its characters
   */
  async saveScene(
    userId: string,
    memoryId: string,
    scene: Scene,
    embedding: number[],
    timestamp: string
  ): Promise<any> {
    try {
      // Insert scene
      const { data: row, error: insertError } = await supabase
        .from('scenes')
        .insert({
          user_id: userId,
          memory_id: memoryId,
          title: scene.title,
          type: scene.type,
          setting: scene.setting,
          time_context: scene.timeContext,
          mood: scene.mood,
          emotional_arc: scene.emotionalArc,
          beats: scene.beats,
          characters: scene.characters,
          interactions: scene.interactions,
          outcome: scene.outcome,
          summary: scene.summary,
          embedding,
          timestamp,
        })
        .select()
        .single();

      if (insertError) {
        logger.error({ error: insertError, scene }, 'Error inserting scene');
        throw insertError;
      }

      if (!row) {
        throw new Error('No scene returned from insert');
      }

      // Save characters in separate table
      if (scene.characters && scene.characters.length > 0) {
        const characterInserts = scene.characters.map((char: SceneCharacter) => ({
          scene_id: row.id,
          name: char.name,
          role: char.role || 'other',
          description: char.description || null,
        }));

        const { error: charError } = await supabase
          .from('scene_characters')
          .insert(characterInserts);

        if (charError) {
          logger.error({ error: charError }, 'Error inserting scene characters');
          // Don't throw - scene is saved, characters are optional
        }
      }

      logger.debug({ sceneId: row.id, title: scene.title }, 'Saved scene');
      return row;
    } catch (error) {
      logger.error({ error, scene }, 'Error saving scene');
      throw error;
    }
  }

  /**
   * Get scenes for a user
   */
  async getScenes(userId: string, limit: number = 100): Promise<Scene[]> {
    try {
      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching scenes');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        setting: row.setting,
        timeContext: row.time_context,
        mood: row.mood,
        emotionalArc: row.emotional_arc || [],
        beats: row.beats || [],
        characters: row.characters || [],
        interactions: row.interactions || [],
        outcome: row.outcome,
        summary: row.summary,
        embedding: row.embedding || [],
        timestamp: row.timestamp,
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting scenes');
      return [];
    }
  }

  /**
   * Get a single scene by ID
   */
  async getScene(sceneId: string): Promise<Scene | null> {
    try {
      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('id', sceneId)
        .single();

      if (error) {
        logger.error({ error }, 'Error fetching scene');
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        title: data.title,
        type: data.type,
        setting: data.setting,
        timeContext: data.time_context,
        mood: data.mood,
        emotionalArc: data.emotional_arc || [],
        beats: data.beats || [],
        characters: data.characters || [],
        interactions: data.interactions || [],
        outcome: data.outcome,
        summary: data.summary,
        embedding: data.embedding || [],
        timestamp: data.timestamp,
        memory_id: data.memory_id,
        user_id: data.user_id,
        created_at: data.created_at,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting scene');
      return null;
    }
  }
}

