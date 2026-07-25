import { describe, expect, it } from 'vitest';

import {
  getDemoLocationOrganizationLinks,
  getDemoOrganizationLocationLinks,
  linkDemoLocationOrganization,
  unlinkDemoLocationOrganization,
} from './locationOrganizationDemoData';

describe('locationOrganizationDemoData', () => {
  it('ships seeded two-way group and place links', () => {
    expect(
      getDemoLocationOrganizationLinks('dummy-loc-1').map((link) => link.organization.name),
    ).toContain('Novara Systems');
    expect(
      getDemoOrganizationLocationLinks('mock-11').map((link) => link.location_name),
    ).toContain('Novara HQ');
  });

  it('makes link and unlink mutations visible from both entity directions', () => {
    const link = linkDemoLocationOrganization(
      { id: 'demo-location-test', name: 'Vanguard Lab' },
      'mock-12',
    );

    expect(getDemoLocationOrganizationLinks('demo-location-test')).toContainEqual(link);
    expect(
      getDemoOrganizationLocationLinks('mock-12').some(
        (location) => location.location_id === 'demo-location-test',
      ),
    ).toBe(true);

    unlinkDemoLocationOrganization(link.id);
    expect(getDemoLocationOrganizationLinks('demo-location-test')).toEqual([]);
    expect(
      getDemoOrganizationLocationLinks('mock-12').some(
        (location) => location.location_id === 'demo-location-test',
      ),
    ).toBe(false);
  });
});
