import { describe, it, expect } from 'vitest';
import { groupTypeMatchesCategory } from './groupTypes';

describe('groupTypeMatchesCategory', () => {
  it('matches brand and vendor filters', () => {
    expect(groupTypeMatchesCategory('brand', 'brands')).toBe(true);
    expect(groupTypeMatchesCategory('vendor', 'vendors')).toBe(true);
    expect(groupTypeMatchesCategory('company', 'brands')).toBe(false);
  });

  it('keeps companies separate from vendors', () => {
    expect(groupTypeMatchesCategory('company', 'companies')).toBe(true);
    expect(groupTypeMatchesCategory('vendor', 'companies')).toBe(false);
  });
});
