import { describe, it, expect, vi } from 'vitest';

import type { EventStorage } from './storageService';
import { materializeSpatialEvents } from './spatialEventMaterializer';

function fakeStorage(existing: Array<{ canonical_title: string }> = []) {
  const created: Array<{ canonical_title: string; summary?: string }> = [];
  const storage = {
    loadAll: vi.fn().mockResolvedValue(existing),
    createEvent: vi.fn(async (_userId: string, e: { canonical_title: string; summary?: string }) => {
      created.push(e);
      return { id: `ev-${created.length}`, canonical_title: e.canonical_title, confidence: 0.6 };
    }),
  } as unknown as EventStorage;
  return { storage, created };
}

describe('materializeSpatialEvents', () => {
  it('creates events from event-classified refs and strips the organizer', async () => {
    const { storage, created } = fakeStorage();
    const res = await materializeSpatialEvents(
      'u1',
      [
        { name: "Ink's Ska Prom", evidence: 'we went to Ink’s Ska Prom' },
        { name: 'Ink Fest' },
        { name: 'Gemini Show' },
      ],
      { storage },
    );
    expect(res.created).toBe(3);
    const titles = created.map((c) => c.canonical_title);
    expect(titles).toContain('Ska Prom');
    expect(titles).toContain('Ink Fest');
    expect(titles).toContain('Gemini Show');
    expect(created.find((c) => c.canonical_title === 'Ska Prom')?.summary).toContain('Ink');
  });

  it('is idempotent — skips events that already exist', async () => {
    const { storage, created } = fakeStorage([{ canonical_title: 'Ska Prom' }]);
    const res = await materializeSpatialEvents('u1', [{ name: "Ink's Ska Prom" }], { storage });
    expect(res.created).toBe(0);
    expect(created).toHaveLength(0);
  });

  it('ignores non-event refs (places, areas, age)', async () => {
    const { storage } = fakeStorage();
    const res = await materializeSpatialEvents(
      'u1',
      [{ name: 'Bad Dogg Compound' }, { name: "Genni's Pit" }, { name: 'my age' }],
      { storage },
    );
    expect(res.created).toBe(0);
  });

  it('dedupes repeated refs within one call', async () => {
    const { storage, created } = fakeStorage();
    await materializeSpatialEvents('u1', [{ name: 'Ink Fest' }, { name: 'Ink Fest' }], { storage });
    expect(created).toHaveLength(1);
  });
});
