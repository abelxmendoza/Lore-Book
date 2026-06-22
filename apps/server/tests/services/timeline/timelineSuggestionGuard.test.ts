import { describe, it, expect } from 'vitest';

import { isBlockedTimeSuggestion } from '../../../src/services/timeline/timelineSuggestionGuard';
import { guardStandaloneTimePhrase } from '../../../src/services/timeline/timelineSuggestionGuard';

describe('timeline suggestion guard', () => {
  it('blocks yesterday as a book suggestion', () => {
    expect(isBlockedTimeSuggestion('yesterday')).toBe(true);
    const verdict = guardStandaloneTimePhrase({ name: 'yesterday', domain: 'characters' });
    expect(verdict?.gate).toBe('reject');
  });

  it('allows Japan Trip as a book suggestion', () => {
    expect(isBlockedTimeSuggestion('Japan Trip')).toBe(false);
  });

  it('blocks every Wednesday as a book suggestion', () => {
    expect(isBlockedTimeSuggestion('every Wednesday')).toBe(true);
  });
});
