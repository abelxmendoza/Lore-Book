/**
 * Persist return-point interaction state without a new memory database.
 * Prefer user_profiles.metadata.return_point_interactions when available;
 * fall back to in-memory for tests / degraded mode.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { InteractionRecord } from './types';

const mem = new Map<string, InteractionRecord[]>();

export async function loadInteractions(userId: string): Promise<InteractionRecord[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      return mem.get(userId) ?? [];
    }
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    const list = meta.return_point_interactions;
    if (Array.isArray(list)) {
      return list as InteractionRecord[];
    }
  } catch (e) {
    logger.debug({ e, userId }, 'returnPoints: loadInteractions fallback memory');
  }
  return mem.get(userId) ?? [];
}

export async function saveInteractions(
  userId: string,
  interactions: InteractionRecord[],
): Promise<void> {
  mem.set(userId, interactions);
  try {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();
    const prev = (data?.metadata ?? {}) as Record<string, unknown>;
    const metadata = {
      ...prev,
      return_point_interactions: interactions.slice(-200),
    };
    await supabaseAdmin
      .from('user_profiles')
      .upsert({ user_id: userId, metadata, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch (e) {
    logger.debug({ e, userId }, 'returnPoints: saveInteractions metadata write skipped');
  }
}
