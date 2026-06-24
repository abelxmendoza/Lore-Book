/**
 * Place duplicate review labeling — labels must come from place subtype, not a
 * generic "Venue alias". Covers the exact cases from the bug report.
 */
import { describe, it, expect } from 'vitest';

import { labelPlaceDuplicate } from '../../../../src/services/lexical/places/placeDuplicateLabeler';

describe('labelPlaceDuplicate', () => {
  it("Abuelas House / Abuela's house → Private residence alias (possessive variant)", () => {
    const r = labelPlaceDuplicate('Abuelas House', "Abuela's house");
    expect(r.label).toBe('Private residence alias');
    expect(r.isAlias).toBe(true);
    expect(r.variantReason).toBe('possessive spelling variant');
    expect(r.canonicalSuggestion).toBe("Abuela's House");
    expect(r.aliasName).toBe('Abuelas House');
    expect(r.placeSubtype).toBe('private_residence');
    expect(r.ownerDisplayName).toBe('Abuela');
    expect(r.privacySensitive).toBe(true);
  });

  it('Mom House / Mom\'s House → Private residence alias', () => {
    const r = labelPlaceDuplicate('Mom House', "Mom's House");
    expect(r.label).toBe('Private residence alias');
    expect(r.variantReason).toBe('possessive spelling variant');
    expect(r.ownerDisplayName).toBe('Mom');
  });

  it('LA / Los Angeles → City alias', () => {
    const r = labelPlaceDuplicate('LA', 'Los Angeles');
    expect(r.label).toBe('City alias');
    expect(r.isAlias).toBe(true);
    expect(r.privacySensitive).toBe(false);
  });

  it('Club Nova / Club Nova goth club → Venue alias', () => {
    const r = labelPlaceDuplicate('Club Nova', 'Club Nova goth club');
    expect(r.label).toBe('Venue alias');
    expect(r.isAlias).toBe(true);
  });

  it('CSUF / California State University Fullerton → School alias', () => {
    const r = labelPlaceDuplicate('CSUF', 'California State University Fullerton');
    expect(r.label).toBe('School alias');
    expect(r.isAlias).toBe(true);
  });

  it('Anaheim / Anaheim Family Home → not an alias (located-in)', () => {
    const r = labelPlaceDuplicate('Anaheim', 'Anaheim Family Home');
    expect(r.isAlias).toBe(false);
    expect(r.label).toBe('Located-in relationship');
  });
});
