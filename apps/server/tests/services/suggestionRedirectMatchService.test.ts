import { describe, it, expect } from 'vitest';

import { buildRedirectMergeNotification, evaluateRedirectTargetMatch } from '../../src/services/suggestionRedirectMatchService';

describe('suggestionRedirectMatchService', () => {
  it('buildRedirectMergeNotification explains exact match', () => {
    const message = buildRedirectMergeNotification('Hell Fairy', 'characters', {
      disposition: 'auto_merged',
      matchedId: 'char-1',
      matchedName: 'Hell Fairy',
      confidence: 1,
      method: 'exact',
    });
    expect(message).toContain('Already in Characters');
  });

  it('evaluateRedirectTargetMatch returns suggested when no candidates', async () => {
    const result = await evaluateRedirectTargetMatch(
      '00000000-0000-4000-8000-000000000099',
      'Totally Unique Redirect Name XYZ',
      'projects'
    );
    expect(result.disposition).toBe('suggested');
    expect(result.identityTier).toBe('distinct');
  });
});
