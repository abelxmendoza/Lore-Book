/**
 * High-level LoreBook product updates shown on the first-open modal.
 *
 * Curated copy is the editorial layer. Recent git commits are classified into
 * the same product themes at build/dev time — commit messages never appear
 * in the UI. A new digest reopens the modal for returning visitors.
 */
import {
  mergeWhatsNewFeeds,
  whatsNewDigest,
} from './whatsNewFromCommits';
import type { WhatsNewEntry } from './whatsNewTypes';

export type { WhatsNewEntry } from './whatsNewTypes';

export const WHATS_NEW_SEEN_KEY = 'lorebook.whatsNew.seenId';
/** Playwright/Cypress can set this value to keep the modal out of the way. */
export const WHATS_NEW_TEST_SUPPRESS = '*';
export const WHATS_NEW_LEGACY_DISMISS_KEY = 'dev-notice-dismissed';

export const CURATED_WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-08-21-still-alpha',
    date: '2026-08-21',
    theme: 'alpha',
    title: 'Still alpha — not beta',
    summary:
      'Layouts, styling, and features are still shifting and can break. This is not a beta-testing build.',
  },
  {
    id: '2026-08-20-life-on-a-calendar',
    date: '2026-08-20',
    theme: 'calendar',
    title: 'Your life, on a real calendar',
    summary:
      'The timeline now sits beside a calendar, so years of memory read like a life — not a stack of chats.',
  },
  {
    id: '2026-08-20-time-when-it-happened',
    date: '2026-08-20',
    theme: 'time',
    title: 'Time means when it happened',
    summary:
      '“Last week” is your week, in your timezone. Character history shows when a moment occurred — not when it was typed.',
  },
  {
    id: '2026-08-18-people-as-they-are',
    date: '2026-08-18',
    theme: 'people',
    title: 'People, as they actually are to you',
    summary:
      'Names, titles, and family ties stay consistent across Character pages, Family Tree, and chat — including how they change.',
  },
  {
    id: '2026-08-16-chat-follows-the-story',
    date: '2026-08-16',
    theme: 'story',
    title: 'Chat that stays with the story',
    summary:
      'Change the subject and LoreBook follows. People, places, and groups keep their own timelines instead of collapsing into one thread.',
  },
  {
    id: '2026-08-12-replies-that-finish',
    date: '2026-08-12',
    theme: 'chat',
    title: 'Replies that finish',
    summary:
      'Conversations no longer vanish mid-thought. Chat stays in sync across devices, and the thread you left is the one you return to.',
  },
];

function gitWhatsNew(): WhatsNewEntry[] {
  if (import.meta.env.MODE === 'test') return [];
  return typeof __LOREBOOK_WHATS_NEW_GIT__ === 'undefined' ? [] : __LOREBOOK_WHATS_NEW_GIT__;
}

export const WHATS_NEW: WhatsNewEntry[] = mergeWhatsNewFeeds(CURATED_WHATS_NEW, gitWhatsNew());

export function latestWhatsNewId(entries: WhatsNewEntry[] = WHATS_NEW): string {
  return whatsNewDigest(entries);
}

export function formatWhatsNewDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function unseenWhatsNew(
  seenId: string | null,
  entries: WhatsNewEntry[] = WHATS_NEW,
): WhatsNewEntry[] {
  if (!seenId || seenId === WHATS_NEW_TEST_SUPPRESS) return entries;
  if (seenId === whatsNewDigest(entries)) return [];
  const index = entries.findIndex((entry) => entry.id === seenId);
  if (index <= 0) return entries;
  return entries.slice(0, index);
}

export function isWhatsNewSuppressed(
  storage: Pick<Storage, 'getItem'>,
  latestId: string = latestWhatsNewId(),
): boolean {
  const seen = storage.getItem(WHATS_NEW_SEEN_KEY);
  return seen === latestId || seen === WHATS_NEW_TEST_SUPPRESS;
}

export function markWhatsNewSeen(
  storage: Pick<Storage, 'setItem'>,
  latestId: string = latestWhatsNewId(),
): void {
  storage.setItem(WHATS_NEW_SEEN_KEY, latestId);
}

export function hasSeenPreviousWhatsNew(storage: Pick<Storage, 'getItem'>): boolean {
  const seen = storage.getItem(WHATS_NEW_SEEN_KEY);
  return Boolean(seen && seen !== WHATS_NEW_TEST_SUPPRESS) ||
    storage.getItem(WHATS_NEW_LEGACY_DISMISS_KEY) === 'true';
}
