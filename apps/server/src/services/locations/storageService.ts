import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ResolvedLocation, ExtractedLocation, LocationMention } from './types';

/**
 * Storage layer for locations and mentions
 */
export class LocationStorage {
  /**
   * Load all locations for a user
   */
  async loadAll(userId: string): Promise<ResolvedLocation[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('locations')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to load locations');
        return [];
      }

      return (data || []).map(l => ({
        id: l.id,
        name: l.name,
        normalized_name: l.normalized_name,
        type: l.type,
        latitude: l.latitude,
        longitude: l.longitude,
        embedding: l.embedding,
        confidence: l.confidence,
        user_id: l.user_id,
        created_at: l.created_at,
        updated_at: l.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load locations');
      return [];
    }
  }

  /**
   * Create a new location
   */
  async createLocation(
    userId: string,
    location: {
      name: string;
      normalized_name: string;
      type?: string;
      embedding?: number[];
      latitude?: number;
      longitude?: number;
      confidence?: number;
    }
  ): Promise<ResolvedLocation> {
    try {
      const { data, error } = await supabaseAdmin
        .from('locations')
        .insert({
          user_id: userId,
          name: location.name,
          normalized_name: location.normalized_name,
          type: location.type || null,
          embedding: location.embedding || null,
          latitude: location.latitude || null,
          longitude: location.longitude || null,
          confidence: location.confidence || 1.0,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create location');
        throw error;
      }

      return {
        id: data.id,
        name: data.name,
        normalized_name: data.normalized_name,
        type: data.type,
        latitude: data.latitude,
        longitude: data.longitude,
        embedding: data.embedding,
        confidence: data.confidence,
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create location');
      throw error;
    }
  }

  /**
   * Link location to a journal entry
   */
  async linkLocation(locationId: string, extracted: ExtractedLocation): Promise<void> {
    try {
      if (!extracted.userId) {
        logger.warn({ extracted }, 'Missing userId in extracted location');
        return;
      }

      const { error } = await supabaseAdmin
        .from('location_mentions')
        .insert({
          user_id: extracted.userId,
          location_id: locationId,
          memory_id: extracted.memoryId,
          raw_text: extracted.raw,
          extracted_name: extracted.extractedName,
        });

      if (error) {
        logger.error({ error, locationId, extracted }, 'Failed to link location');
      }
    } catch (error) {
      logger.error({ error, locationId, extracted }, 'Failed to link location');
    }
  }
}

