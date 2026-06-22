import { fetchJson } from '../lib/api';

export type LoreAvatarResponse =
  | { success: true; avatar_url: string; source: 'lore_generated' }
  | {
      success: false;
      reason: 'disabled' | 'insufficient_lore' | 'generation_failed' | 'rate_limited';
      message: string;
      avatar_url?: string;
      nextEligibleAt?: string;
    };

export const characterAvatarApi = {
  generateFromLore: (characterId: string, opts?: { force?: boolean }) =>
    fetchJson<LoreAvatarResponse>(`/api/characters/${encodeURIComponent(characterId)}/avatar/lore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: opts?.force ?? false }),
    }),
};
