import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Cache a DiceBear avatar SVG in Supabase storage
 * This is optional - if it fails, we'll use the direct DiceBear URL
 * @param id - Character UUID
 * @param url - DiceBear API URL
 * @returns Cached Supabase URL or original URL if caching fails
 */
export async function cacheAvatar(id: string, url: string): Promise<string> {
  try {
    // Fetch the SVG from DiceBear
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch avatar: ${response.statusText}`);
    }

    const svg = await response.text();

    // Upload to Supabase storage
    const { data, error } = await supabaseAdmin.storage
      .from('avatars')
      .upload(`characters/${id}.svg`, svg, {
        contentType: 'image/svg+xml',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    // Return public URL
    const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/avatars/characters/${id}.svg`;
    logger.debug({ characterId: id }, 'Avatar cached successfully');
    return publicUrl;
  } catch (error) {
    // Log but don't fail - return original URL
    logger.warn({ error, characterId: id, url }, 'Avatar caching failed, using direct URL');
    return url;
  }
}
