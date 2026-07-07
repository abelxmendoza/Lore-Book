import { describe, it, expect, vi } from 'vitest';

import { materializeSpatialEvents, type EventMaterializerDeps } from './spatialEventMaterializer';

function fakeDeps(existing: Array<{ id: string; title: string; metadata?: Record<string, unknown> }> = []) {
  const events = existing.map((e) => ({ ...e }));
  const inserted: Array<{ title: string; summary?: string }> = [];
  const metadataUpdates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  const deps: EventMaterializerDeps = {
    loadEvents: vi.fn().mockResolvedValue(events),
    insertEvent: vi.fn(async (_u, ev) => {
      const rec = { id: `ev-${events.length + 1}`, title: ev.title, summary: ev.summary, metadata: ev.metadata ?? {} };
      events.push(rec);
      inserted.push({ title: ev.title, summary: ev.summary });
      return rec;
    }),
    updateEventMetadata: vi.fn(async (_u, id, metadata) => {
      metadataUpdates.push({ id, metadata });
    }),
  };
  return { deps, inserted, metadataUpdates };
}

describe('materializeSpatialEvents', () => {
  it('creates events (into resolved_events) and strips the organizer', async () => {
    const { deps, inserted } = fakeDeps();
    const res = await materializeSpatialEvents(
      'u1',
      [{ name: "Ink's Ska Prom", evidence: 'we went to Ink’s Ska Prom' }, { name: 'Gemini Show' }],
      { deps },
    );
    expect(res.created).toBe(2);
    expect(inserted.map((i) => i.title)).toContain('Ska Prom');
    expect(inserted.find((i) => i.title === 'Ska Prom')?.summary).toContain('Ink');
  });

  it('is idempotent — skips events that already exist', async () => {
    const { deps, inserted } = fakeDeps([{ id: 'e1', title: 'Ska Prom' }]);
    const res = await materializeSpatialEvents('u1', [{ name: "Ink's Ska Prom" }], { deps });
    expect(res.created).toBe(0);
    expect(inserted).toHaveLength(0);
  });

  it('links an unresolved venue to the event it shares an evidence line with', async () => {
    const evidence = 'security kicked me out of that venue at Ink Fest';
    const { deps, metadataUpdates } = fakeDeps();
    const res = await materializeSpatialEvents(
      'u1',
      [{ name: 'Ink Fest', evidence }],
      { deps, unresolvedVenues: [{ name: 'Security Kickout Venue', evidence }] },
    );
    expect(res.created).toBe(1);
    expect(res.unresolvedLinked).toBe(1);
    const venues = metadataUpdates[0].metadata.unresolved_venues as Array<{ name: string; status: string }>;
    expect(venues[0]).toMatchObject({ name: 'Security Kickout Venue', status: 'pending' });
  });

  it('does not link an unresolved venue when no event shares its evidence (no Place pollution)', async () => {
    const { deps, metadataUpdates } = fakeDeps();
    const res = await materializeSpatialEvents(
      'u1',
      [{ name: 'Ink Fest', evidence: 'went to Ink Fest' }],
      { deps, unresolvedVenues: [{ name: 'that venue', evidence: 'kicked out of that venue' }] },
    );
    expect(res.unresolvedLinked).toBe(0);
    expect(metadataUpdates).toHaveLength(0);
  });

  it('ignores non-event refs (places, areas, age)', async () => {
    const { deps } = fakeDeps();
    const res = await materializeSpatialEvents(
      'u1',
      [{ name: 'Bad Dogg Compound' }, { name: "Genni's Pit" }, { name: 'my age' }],
      { deps },
    );
    expect(res.created).toBe(0);
  });
});
