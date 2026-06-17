import { describe, expect, it } from 'vitest';

import { nameHousehold } from '../../src/services/entities/householdNaming';

describe('householdNaming', () => {
  it('uses senior kinship anchor instead of concatenating family members', () => {
    expect(nameHousehold([
      { name: 'Morgan Gray', mentions: 3 },
      { name: 'Tio Ralph', mentions: 2 },
    ])).toBe("Tio Ralph's Family");
  });

  it('uses shared surname when multiple members have one', () => {
    expect(nameHousehold([
      { name: 'Ralph Mendoza' },
      { name: 'Morgan Gray Mendoza' },
      { name: 'Tio Juan' },
    ])).toBe('Mendoza Family');
  });

  it('falls back to most-mentioned member when no kinship or surname exists', () => {
    expect(nameHousehold([
      { name: 'Daisy', mentions: 1 },
      { name: 'Velvet Hour', mentions: 4 },
    ])).toBe("Velvet Hour's Family");
  });
});
