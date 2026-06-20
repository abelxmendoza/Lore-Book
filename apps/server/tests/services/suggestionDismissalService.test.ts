import { describe, it, expect } from 'vitest';

import {
  MAX_SUGGESTION_DISMISSALS,
  normalizeSuggestionDismissalName,
} from '../../src/services/suggestionDismissalService';

describe('suggestionDismissalService helpers', () => {
  it('normalizes project names with canonical keys', () => {
    expect(normalizeSuggestionDismissalName('projects', 'LoreBook project')).toBe('lorebook');
  });

  it('uses five dismissals as permanent threshold constant', () => {
    expect(MAX_SUGGESTION_DISMISSALS).toBe(5);
  });
});
