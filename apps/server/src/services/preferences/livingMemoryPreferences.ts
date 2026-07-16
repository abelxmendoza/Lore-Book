/**
 * Living Memory preferences — LoreBook’s user-facing analog of Codex
 * use_memories / generate_memories / ambient pause controls.
 *
 * Persisted on user_profiles.metadata.living_memory (no new table).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type LivingMemoryPreferences = {
  /** Inject life-graph evidence into Working Memory / recall. */
  useLivingMemory: boolean;
  /** Allow this session’s content to propose durable memory writes. */
  writeLivingMemory: boolean;
  /** Pause ambient Life Chronicle intake (e.g. X → lore). */
  ambientCapturePaused: boolean;
  /** Allow durable writes that originated from external/integration context. */
  externalContextWrites: boolean;
};

export const DEFAULT_LIVING_MEMORY_PREFERENCES: LivingMemoryPreferences = {
  useLivingMemory: true,
  writeLivingMemory: true,
  ambientCapturePaused: false,
  externalContextWrites: true,
};

const META_KEY = 'living_memory';

const mem = new Map<string, LivingMemoryPreferences>();

function normalize(raw: unknown): LivingMemoryPreferences {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    useLivingMemory: typeof src.useLivingMemory === 'boolean'
      ? src.useLivingMemory
      : DEFAULT_LIVING_MEMORY_PREFERENCES.useLivingMemory,
    writeLivingMemory: typeof src.writeLivingMemory === 'boolean'
      ? src.writeLivingMemory
      : DEFAULT_LIVING_MEMORY_PREFERENCES.writeLivingMemory,
    ambientCapturePaused: typeof src.ambientCapturePaused === 'boolean'
      ? src.ambientCapturePaused
      : DEFAULT_LIVING_MEMORY_PREFERENCES.ambientCapturePaused,
    externalContextWrites: typeof src.externalContextWrites === 'boolean'
      ? src.externalContextWrites
      : DEFAULT_LIVING_MEMORY_PREFERENCES.externalContextWrites,
  };
}

export async function loadLivingMemoryPreferences(
  userId: string,
): Promise<LivingMemoryPreferences> {
  if (!userId) return { ...DEFAULT_LIVING_MEMORY_PREFERENCES };

  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return mem.get(userId) ?? { ...DEFAULT_LIVING_MEMORY_PREFERENCES };
    }

    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    if (meta[META_KEY] == null) {
      // Profile row may exist without this key yet — keep process cache if present.
      return mem.get(userId) ?? { ...DEFAULT_LIVING_MEMORY_PREFERENCES };
    }

    const prefs = normalize(meta[META_KEY]);
    mem.set(userId, prefs);
    return prefs;
  } catch (e) {
    logger.debug({ e, userId }, 'livingMemoryPreferences: load fallback');
    return mem.get(userId) ?? { ...DEFAULT_LIVING_MEMORY_PREFERENCES };
  }
}

export async function saveLivingMemoryPreferences(
  userId: string,
  patch: Partial<LivingMemoryPreferences>,
): Promise<LivingMemoryPreferences> {
  const current = await loadLivingMemoryPreferences(userId);
  const next = normalize({ ...current, ...patch });
  mem.set(userId, next);

  try {
    const { data } = await supabaseAdmin
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();

    const prev = (data?.metadata ?? {}) as Record<string, unknown>;
    const metadata = {
      ...prev,
      [META_KEY]: next,
    };

    await supabaseAdmin
      .from('user_profiles')
      .upsert(
        { user_id: userId, metadata, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
  } catch (e) {
    logger.debug({ e, userId }, 'livingMemoryPreferences: save metadata skipped');
  }

  return next;
}
