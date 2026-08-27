import { describe, expect, it } from 'vitest';

import { REDIRECTABLE_SUGGESTION_DOMAINS, SUGGESTION_DOMAIN_LABELS } from './suggestionMatchTypes';

describe('REDIRECTABLE_SUGGESTION_DOMAINS', () => {
  it('includes organizations, so "Send elsewhere" offers it as a target', () => {
    // Regression: the "Also looks like" indicator can flag 'organizations' as
    // an alternative category (via detectAlternativeCategories on the
    // backend), but the "Wrong category? Send elsewhere" quick-action list
    // omitted it entirely — the detector and the redirect UI were out of sync.
    expect(REDIRECTABLE_SUGGESTION_DOMAINS).toContain('organizations');
  });

  it('has a label for every redirectable domain', () => {
    for (const domain of REDIRECTABLE_SUGGESTION_DOMAINS) {
      expect(SUGGESTION_DOMAIN_LABELS[domain]).toBeTruthy();
    }
  });
});
