import { describe, expect, it } from 'vitest';

import { buildHouseholdClipboardText } from './householdClipboard';

describe('buildHouseholdClipboardText', () => {
  it('exports an empty household list clearly', () => {
    const text = buildHouseholdClipboardText([], { title: 'Households' });
    expect(text).toContain('Households (0 items)');
    expect(text).toContain('(empty)');
  });

  it('includes location, head, residents, and visitors', () => {
    const text = buildHouseholdClipboardText(
      [
        {
          name: "Jamie's House",
          locationName: '123 Maple St',
          headOfHousehold: 'Jamie',
          residents: [
            { name: 'Jamie', kinshipLabel: 'self' },
            { name: 'Marcus', kinshipLabel: 'partner' },
          ],
          visitors: [{ name: 'Elena', kinshipLabel: 'mom' }],
          residentCount: 2,
        },
      ],
      { title: 'Households', filters: ['tab=households'] },
    );

    expect(text).toContain('Households (1 item)');
    expect(text).toContain('Filters: tab=households');
    expect(text).toContain('123 Maple St');
    expect(text).toContain("Household: Jamie's House");
    expect(text).toContain('Head: Jamie');
    expect(text).toContain('Residents: Jamie (self), Marcus (partner)');
    expect(text).toContain('Visitors: Elena (mom)');
  });
});
