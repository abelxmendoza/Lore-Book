import { describe, expect, it } from 'vitest';

import { hasFoundationContent } from './foundationContent';

describe('hasFoundationContent', () => {
  it('treats empty-marker blocks as no record', () => {
    expect(hasFoundationContent('Location not recorded.')).toBe(false);
    expect(hasFoundationContent('No character record found for "Jamie". Not yet created.')).toBe(false);
    expect(hasFoundationContent('')).toBe(false);
  });

  it('keeps real foundation snapshots', () => {
    expect(hasFoundationContent('## FAMILY\n- Jamie — partner')).toBe(true);
  });
});
