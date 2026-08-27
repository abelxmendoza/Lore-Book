import { describe, expect, it, vi } from 'vitest';

vi.mock('./suggestionRedirectMatchService', async () => {
  const actual = await vi.importActual<typeof import('./suggestionRedirectMatchService')>(
    './suggestionRedirectMatchService',
  );
  return {
    ...actual,
    evaluateRedirectTargetMatch: vi.fn().mockResolvedValue({ disposition: 'suggested', confidence: 0 }),
    applyRedirectTargetMerge: vi.fn(),
  };
});

import { organizationSuggestionService } from './organizations/organizationSuggestionService';
import { suggestionReclassifyService } from './suggestionReclassifyService';

describe('suggestionReclassifyService — redirect to organizations', () => {
  it('actually seeds an organization suggestion instead of silently no-oping', async () => {
    // Regression: 'organizations' used to fall through seedTargetSuggestion's
    // switch to `default: break`, so redirecting a suggestion there did
    // nothing while the response still claimed success ("Sent to
    // Organizations. LoreBook will learn from this.") — a false positive.
    const upsertSpy = vi
      .spyOn(organizationSuggestionService, 'upsertFromInference')
      .mockResolvedValue(true);

    const result = await suggestionReclassifyService.reclassify('user-1', {
      name: 'Trinidad Suave',
      fromDomain: 'characters',
      toDomain: 'organizations',
      evidence: 'Trinidad Suave booked the venue for us',
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [userId, candidate] = upsertSpy.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(candidate).toMatchObject({
      displayName: 'Trinidad Suave',
      organizationType: 'unknown_organization',
    });
    expect(result.success).toBe(true);
    expect(result.toDomain).toBe('organizations');

    upsertSpy.mockRestore();
  });
});
