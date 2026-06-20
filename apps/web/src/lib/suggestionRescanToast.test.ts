import { describe, it, expect } from 'vitest';

import {
  appendLorebookParseToast,
  formatLorebookParseToastLine,
  formatSuggestionRescanToast,
} from './suggestionRescanToast';
import type { SuggestionRescanSummary } from '../api/suggestionRescan';

describe('suggestionRescanToast', () => {
  it('formats LoreBook line when suggestions were seeded', () => {
    expect(
      formatLorebookParseToastLine({
        linesParsed: 40,
        operationsSeen: 12,
        applied: 3,
        skipped: 9,
        byDomain: { characters: 2, skills: 1 },
      })
    ).toBe('LoreBook parsed 40 lines · seeded 3 suggestions');
  });

  it('formats LoreBook scan-only line when nothing was applied', () => {
    expect(
      formatLorebookParseToastLine({
        linesParsed: 18,
        operationsSeen: 5,
        applied: 0,
        skipped: 5,
        byDomain: {},
      })
    ).toBe('LoreBook scanned 18 lines · 5 signals reviewed');
  });

  it('combines domain and LoreBook lines', () => {
    const summary: SuggestionRescanSummary = {
      domains: ['quests'],
      lorebookParse: {
        linesParsed: 10,
        operationsSeen: 4,
        applied: 2,
        skipped: 2,
        byDomain: { quests: 2 },
      },
      results: { quests: { scanned: true, upserted: 1 } },
    };
    expect(formatSuggestionRescanToast(summary, 'quests')).toBe(
      'Found 1 quest in your chats. LoreBook parsed 10 lines · seeded 2 suggestions'
    );
  });

  it('appendLorebookParseToast leaves base unchanged when no lorebook block', () => {
    expect(
      appendLorebookParseToast('Rescan complete.', { domains: ['characters'], results: {} })
    ).toBe('Rescan complete.');
  });
});
