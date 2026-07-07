import { describe, it, expect, vi } from 'vitest';

import { materializeVenueAreas, type VenueAreaDeps, type KnownLocation } from './spatialVenueAreaMaterializer';

function deps(known: KnownLocation[]) {
  const inserted: Array<{ name: string; parent_location_id: string }> = [];
  const d: VenueAreaDeps = {
    loadLocations: vi.fn().mockResolvedValue(known),
    insertVenueArea: vi.fn(async (_u, row) => {
      inserted.push({ name: row.name, parent_location_id: row.parent_location_id });
      return { id: `area-${inserted.length}` };
    }),
  };
  return { d, inserted };
}

const VENUE: KnownLocation = { id: 'loc-bad-dogg', name: 'Bad Dogg Compound', aliases: [] };

describe('materializeVenueAreas', () => {
  it('nests a venue area under a known parent venue found in the evidence', async () => {
    const { d, inserted } = deps([VENUE]);
    const res = await materializeVenueAreas(
      'u1',
      [{ name: "Renna's Pit", evidence: 'the pit at Bad Dogg Compound was wild' }],
      d,
    );
    expect(res.created).toBe(1);
    expect(inserted[0]).toEqual({ name: 'Pit', parent_location_id: 'loc-bad-dogg' });
  });

  it('skips when no known parent venue is in the evidence (no orphan areas)', async () => {
    const { d, inserted } = deps([VENUE]);
    const res = await materializeVenueAreas('u1', [{ name: 'pit', evidence: 'we were in the pit' }], d);
    expect(res.created).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it('does not create a duplicate when the child area already exists', async () => {
    const existingChild: KnownLocation = { id: 'loc-pit', name: 'Pit', parent_location_id: 'loc-bad-dogg' };
    const { d, inserted } = deps([VENUE, existingChild]);
    const res = await materializeVenueAreas(
      'u1',
      [{ name: 'pit', evidence: 'back in the pit at Bad Dogg Compound' }],
      d,
    );
    expect(res.created).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it('ignores non-venue-area refs', async () => {
    const { d } = deps([VENUE]);
    const res = await materializeVenueAreas(
      'u1',
      [{ name: 'Ink Fest', evidence: 'at Bad Dogg Compound' }, { name: 'Bad Dogg Compound' }],
      d,
    );
    expect(res.created).toBe(0);
  });
});
