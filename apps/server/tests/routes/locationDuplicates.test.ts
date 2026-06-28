import { describe, expect, it } from 'vitest';

import { buildLocationDuplicateGroups } from '../../src/routes/locations';

describe('buildLocationDuplicateGroups', () => {
  it("keeps private residence variants focused while allowing Anaheim Family Home as Abuela's alias", () => {
    const groups = buildLocationDuplicateGroups([
      { id: 'abuela-no-apostrophe', name: 'Abuelas House', type: 'house', metadata: {} },
      { id: 'abuela-apostrophe', name: "Abuela's house", type: 'house', metadata: {} },
      { id: 'mom-no-apostrophe', name: 'Moms House', type: 'place', metadata: {} },
      { id: 'mom-apostrophe', name: "Mom's House", type: 'private_residence', metadata: {} },
      { id: 'anaheim-family-home', name: 'Anaheim Family Home', type: 'home', metadata: {} },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.canonical_name)).toEqual(
      expect.arrayContaining(["Abuela's House", "Mom's House"])
    );
    expect(groups.flatMap((group) => group.locations.map((location) => location.name))).toEqual(
      expect.arrayContaining(['Abuelas House', "Abuela's house", 'Moms House', "Mom's House"])
    );
    expect(
      groups.some((group) => {
        const names = group.locations.map((location) => location.name);
        return names.includes('Anaheim Family Home') && names.some((name) => /abuela/i.test(name));
      })
    ).toBe(true);
    expect(
      groups.some((group) => {
        const names = group.locations.map((location) => location.name);
        return names.includes('Anaheim Family Home') && names.some((name) => /^mom/i.test(name));
      })
    ).toBe(false);
  });
});
