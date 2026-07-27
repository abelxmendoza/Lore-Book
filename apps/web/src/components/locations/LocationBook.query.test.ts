import { describe, expect, it } from 'vitest';

import { locationBookDemoLocations } from '../../mocks/locationBookDemo';
import { demoLocationQuery } from './LocationBook';

describe('LocationBook demo query', () => {
  it('queries people, organizations, map cleanup, and nested places without an API', () => {
    expect(
      demoLocationQuery(locationBookDemoLocations, 'places I visited with Marcus Johnson').results
        .some((result) => result.name === 'Novara HQ'),
    ).toBe(true);
    expect(
      demoLocationQuery(locationBookDemoLocations, 'locations linked to Vanguard Robotics').results
        .map((result) => result.name),
    ).toContain('Novara HQ');
    expect(
      demoLocationQuery(locationBookDemoLocations, 'locations missing coordinates').results
        .map((result) => result.name),
    ).toContain('Home Studio');
    expect(
      demoLocationQuery(locationBookDemoLocations, 'places inside Novara HQ').results
        .map((result) => result.name),
    ).toEqual(['Novara Design Lab']);
  });
});
