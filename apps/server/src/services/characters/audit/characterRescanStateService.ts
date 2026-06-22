/**
 * Tracks incremental character rescan watermarks and validated person keys
 * so rescans skip already-processed episodes and known character identities.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { supabaseAdmin } from '../../supabaseClient';
import { logger } from '../../../logger';

export type CharacterRescanState = {
  watermarkAt: string | null;
  validatedPersonKeys: string[];
  lastRescanAt: string | null;
  lastCardCleanupAt: string | null;
  lastDeletionSourceRescanAt: string | null;
};

const EMPTY_STATE: CharacterRescanState = {
  watermarkAt: null,
  validatedPersonKeys: [],
  lastRescanAt: null,
  lastCardCleanupAt: null,
  lastDeletionSourceRescanAt: null,
};

type LorekeeperUserMeta = {
  character_rescan?: CharacterRescanState;
};

function readState(raw: unknown): CharacterRescanState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const nested = (raw as LorekeeperUserMeta).character_rescan;
  if (!nested || typeof nested !== 'object') return { ...EMPTY_STATE };
  return {
    watermarkAt: typeof nested.watermarkAt === 'string' ? nested.watermarkAt : null,
    validatedPersonKeys: Array.isArray(nested.validatedPersonKeys)
      ? nested.validatedPersonKeys.filter((k): k is string => typeof k === 'string')
      : [],
    lastRescanAt: typeof nested.lastRescanAt === 'string' ? nested.lastRescanAt : null,
    lastCardCleanupAt: typeof nested.lastCardCleanupAt === 'string' ? nested.lastCardCleanupAt : null,
    lastDeletionSourceRescanAt:
      typeof nested.lastDeletionSourceRescanAt === 'string' ? nested.lastDeletionSourceRescanAt : null,
  };
}

class CharacterRescanStateService {
  async load(userId: string): Promise<CharacterRescanState> {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const meta = (data.user?.user_metadata ?? {}) as LorekeeperUserMeta;
      return readState(meta);
    } catch (err) {
      logger.debug({ err, userId }, 'Failed to load character rescan state');
      return { ...EMPTY_STATE };
    }
  }

  async save(userId: string, patch: Partial<CharacterRescanState>): Promise<void> {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const existing = readState(data.user?.user_metadata);
      const next: CharacterRescanState = {
        ...existing,
        ...patch,
        validatedPersonKeys: patch.validatedPersonKeys ?? existing.validatedPersonKeys,
      };
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(data.user?.user_metadata ?? {}),
          character_rescan: next,
        },
      });
    } catch (err) {
      logger.warn({ err, userId }, 'Failed to save character rescan state');
    }
  }

  /** Active character names + aliases + user-validated audit decisions. */
  async buildValidatedPersonKeySet(userId: string): Promise<Set<string>> {
    const keys = new Set<string>();
    const state = await this.load(userId);
    for (const key of state.validatedPersonKeys) {
      if (key) keys.add(key);
    }

    const { data } = await supabaseAdmin
      .from('characters')
      .select('name, alias, metadata, status')
      .eq('user_id', userId)
      .neq('status', 'archived');

    for (const row of data ?? []) {
      const name = String(row.name ?? '').trim();
      if (name) keys.add(normalizeNameKey(name));
      for (const alias of (row.alias ?? []) as string[]) {
        if (alias?.trim()) keys.add(normalizeNameKey(alias));
      }
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const audit = meta.card_audit_review as Record<string, unknown> | undefined;
      if (audit?.action === 'keep' || audit?.action === 'lock' || audit?.action === 'rename') {
        if (name) keys.add(normalizeNameKey(name));
        const locked = typeof audit.lockedTitle === 'string' ? audit.lockedTitle : null;
        if (locked) keys.add(normalizeNameKey(locked));
      }
    }

    return keys;
  }

  async recordRescanComplete(
    userId: string,
    opts: { watermarkAt: string; newValidatedKeys?: string[] },
  ): Promise<void> {
    const state = await this.load(userId);
    const mergedKeys = new Set([...state.validatedPersonKeys, ...(opts.newValidatedKeys ?? [])]);
    await this.save(userId, {
      watermarkAt: opts.watermarkAt,
      validatedPersonKeys: [...mergedKeys].slice(-500),
      lastRescanAt: new Date().toISOString(),
    });
  }

  async recordCardCleanup(userId: string): Promise<void> {
    await this.save(userId, { lastCardCleanupAt: new Date().toISOString() });
  }

  async removeValidatedKeys(userId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const state = await this.load(userId);
    const remove = new Set(keys.map((k) => normalizeNameKey(k)).filter(Boolean));
    await this.save(userId, {
      validatedPersonKeys: state.validatedPersonKeys.filter((k) => !remove.has(k)),
    });
  }

  async recordDeletionSourceRescan(userId: string): Promise<void> {
    await this.save(userId, { lastDeletionSourceRescanAt: new Date().toISOString() });
  }
}

export const characterRescanStateService = new CharacterRescanStateService();
