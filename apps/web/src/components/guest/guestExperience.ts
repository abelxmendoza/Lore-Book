import type { GuestState } from '../../contexts/GuestContext';
import { GUEST_CHAT_LIMIT } from '../../contexts/GuestContext';

export type GuestUsage = {
  limit: number;
  used: number;
  remaining: number;
  limitReached: boolean;
  percentUsed: number;
};

export function getGuestUsage(guestState: GuestState | null | undefined): GuestUsage {
  const limit = guestState?.chatLimit ?? GUEST_CHAT_LIMIT;
  const used = guestState?.chatMessagesUsed ?? 0;
  const remaining = Math.max(0, limit - used);
  return {
    limit,
    used,
    remaining,
    limitReached: remaining <= 0,
    percentUsed: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
  };
}

export const GUEST_SESSION_FEATURES = [
  'Real AI chat with live extraction',
  'Temporary characters, memories & locations',
  'Browse your lore in Characters & Timeline',
] as const;

export const GUEST_UNLOCK_FEATURES = [
  'Unlimited chat with persistent memory',
  'Save conversations across devices',
  'Full timeline, characters, and lore book',
  '7-day free Pro trial after sign-up',
] as const;
