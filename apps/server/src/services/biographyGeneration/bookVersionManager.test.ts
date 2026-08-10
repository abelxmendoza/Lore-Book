import { describe, it, expect, vi, beforeEach } from 'vitest';

import { supabaseAdmin } from '../supabaseClient';
import { bookVersionManager } from './bookVersionManager';
import type { Biography } from './types';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

function biography(overrides: Partial<Biography> = {}): Biography {
  return {
    id: 'bio-1',
    title: 'My Life',
    version: 'main',
    chapters: [],
    metadata: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      spec: {
        scope: 'full_life',
        tone: 'neutral',
        depth: 'detailed',
        audience: 'self',
        includeIntrospection: true,
      },
      atomCount: 10,
      filtersApplied: [],
    },
    ...overrides,
  } as Biography;
}

function chapter(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Chapter ${id}`,
    text: 'Some narrative prose.',
    timeSpan: { start: '2025-01-01', end: '2025-02-01' },
    timelineChapterIds: [],
    atoms: [],
    themes: ['growth'],
    ...overrides,
  };
}

function mockBiographyLookup(bios: Biography[]) {
  const single = vi
    .fn()
    .mockResolvedValueOnce({ data: { biography_data: bios[0] }, error: null })
    .mockResolvedValueOnce({ data: { biography_data: bios[1] }, error: null });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  (supabaseAdmin.from as any).mockReturnValue({ select });
}

describe('bookVersionManager.compareVersions (Difference Contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches chapters by id, not incidental timeSpan equality', async () => {
    // Same chapter id, but its time span shifted slightly between editions —
    // a timeSpan-equality match would miss this and wrongly report it as
    // both removed and added instead of changed.
    const from = biography({ chapters: [chapter('ch-1', { timeSpan: { start: '2025-01-01', end: '2025-02-01' } })] });
    const to = biography({
      chapters: [chapter('ch-1', { timeSpan: { start: '2025-01-02', end: '2025-02-01' }, text: 'Updated prose.' })],
    });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    expect(result.differences).toHaveLength(1);
    expect(result.differences[0]).toMatchObject({ chapterId: 'ch-1', changeType: 'changed' });
  });

  it('reports a chapter present only in the newer edition as added', async () => {
    const from = biography({ chapters: [chapter('ch-1')] });
    const to = biography({ chapters: [chapter('ch-1'), chapter('ch-2')] });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    const added = result.differences.find((d) => d.chapterId === 'ch-2');
    expect(added?.changeType).toBe('added');
  });

  it('reports a chapter present only in the older edition as removed', async () => {
    const from = biography({ chapters: [chapter('ch-1'), chapter('ch-2')] });
    const to = biography({ chapters: [chapter('ch-1')] });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    const removed = result.differences.find((d) => d.chapterId === 'ch-2');
    expect(removed?.changeType).toBe('removed');
  });

  it('reports an unchanged chapter that moved position as reordered', async () => {
    const from = biography({ chapters: [chapter('ch-1'), chapter('ch-2')] });
    const to = biography({ chapters: [chapter('ch-2'), chapter('ch-1')] });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    // A two-element swap is minimally described as ONE chapter moving
    // relative to a stable anchor — flagging both as reordered would double
    // count the same transposition (git diffs work the same way: a swap is
    // one move against a fixed point, not two).
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].changeType).toBe('reordered');
  });

  it('reports no differences for two identical editions', async () => {
    const from = biography({ chapters: [chapter('ch-1')] });
    const to = biography({ chapters: [chapter('ch-1')] });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    expect(result.differences).toHaveLength(0);
    expect(result.metadataChanges).toHaveLength(0);
  });

  it('reports book-level title and atom-count changes as metadataChanges', async () => {
    const from = biography({ title: 'My Life', metadata: { ...biography().metadata, atomCount: 10 } });
    const to = biography({ title: 'My Life, Revised', metadata: { ...biography().metadata, atomCount: 15 } });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');

    expect(result.metadataChanges).toEqual(
      expect.arrayContaining([
        expect.stringContaining('My Life'),
        expect.stringContaining('10'),
      ]),
    );
  });

  it('survives simultaneous add + remove + change + reorder without cross-contaminating categories', async () => {
    // Acceptance test: "Chapter mutation torture test" — one edition mutated
    // on every axis at once must resolve to exactly one correct category per
    // chapter, not let one change type mask or merge into another.
    const from = biography({
      chapters: [
        chapter('kept-same'),
        chapter('to-edit', { text: 'Original prose.' }),
        chapter('to-remove'),
        chapter('to-reorder-a'),
        chapter('to-reorder-b'),
      ],
    });
    const to = biography({
      chapters: [
        // to-reorder-b and to-reorder-a swapped positions; to-edit changed;
        // to-remove is gone; a new chapter is added; kept-same is untouched.
        chapter('kept-same'),
        chapter('to-edit', { text: 'Rewritten prose.' }),
        chapter('to-reorder-b'),
        chapter('to-reorder-a'),
        chapter('brand-new'),
      ],
    });
    mockBiographyLookup([from, to]);

    const result = await bookVersionManager.compareVersions('from-id', 'to-id', 'user-1');
    const byId = new Map(result.differences.map((d) => [d.chapterId, d.changeType]));

    expect(byId.get('kept-same')).toBeUndefined(); // unchanged chapters produce no entry
    expect(byId.get('to-edit')).toBe('changed');
    expect(byId.get('to-remove')).toBe('removed');
    expect(byId.get('brand-new')).toBe('added');
    // Exactly one of the swapped pair is flagged — the minimal move relative
    // to the other, stable chapters (kept-same, to-edit) that anchor the
    // ordering. Which specific one is an implementation detail of the LIS
    // tie-break, not a contract; what matters is the diff stays minimal.
    const reorderedCount = ['to-reorder-a', 'to-reorder-b'].filter((id) => byId.get(id) === 'reordered').length;
    expect(reorderedCount).toBe(1);
    expect(result.differences).toHaveLength(4);
  });
});

describe('bookVersionManager.getVersionHistory (Edition lineage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockVersionRows(rows: Array<Record<string, unknown>>) {
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq2 = vi.fn().mockReturnValue({ order });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    (supabaseAdmin.from as any).mockReturnValue({ select });
  }

  it('publish V1 -> V2 -> V3: only the highest lorebook_version is published, the rest are superseded', async () => {
    mockVersionRows([
      { id: 'v3', version: 'main', lorebook_version: 3, base_biography_id: 'v2', title: 'My Life', created_at: '2026-01-03', memory_snapshot_at: null, atom_snapshot_hash: 'hash3' },
      { id: 'v2', version: 'main', lorebook_version: 2, base_biography_id: 'v1', title: 'My Life', created_at: '2026-01-02', memory_snapshot_at: null, atom_snapshot_hash: 'hash2' },
      { id: 'v1', version: 'main', lorebook_version: 1, base_biography_id: null, title: 'My Life', created_at: '2026-01-01', memory_snapshot_at: null, atom_snapshot_hash: 'hash1' },
    ]);

    const history = await bookVersionManager.getVersionHistory('my-life', 'user-1');

    expect(history).toHaveLength(3);
    const byId = new Map(history.map((v) => [v.id, v]));
    expect(byId.get('v3')).toMatchObject({ lorebookVersion: 3, status: 'published', baseBiographyId: 'v2' });
    expect(byId.get('v2')).toMatchObject({ lorebookVersion: 2, status: 'superseded', baseBiographyId: 'v1' });
    expect(byId.get('v1')).toMatchObject({ lorebookVersion: 1, status: 'superseded' });
  });
});

describe('bookVersionManager.getManifest (Manifest Contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockManifestRow(row: Record<string, unknown> | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: row ? null : new Error('not found') });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    (supabaseAdmin.from as any).mockReturnValue({ select });
  }

  it('reports known provenance accurately and unrecorded generation fields as null, never guessed', async () => {
    const bio = biography({ metadata: { ...biography().metadata, atomCount: 42, filtersApplied: ['sensitivity>0.6'] } });
    mockManifestRow({
      id: 'v1',
      lorebook_name: 'my-life',
      lorebook_version: 1,
      version: 'main',
      memory_snapshot_at: '2026-01-01T00:00:00.000Z',
      atom_snapshot_hash: 'abc123',
      biography_data: bio,
    });

    const manifest = await bookVersionManager.getManifest('v1', 'user-1');

    expect(manifest).toMatchObject({
      editionId: 'v1',
      publicationHandle: 'my-life',
      lorebookVersion: 1,
      knowledgeSnapshot: {
        atomCount: 42,
        atomSnapshotHash: 'abc123',
        memorySnapshotAt: '2026-01-01T00:00:00.000Z',
      },
      filtersApplied: ['sensitivity>0.6'],
      generatorVersion: null,
      promptVersion: null,
      modelVersion: null,
      filterVersion: null,
    });
  });

  it('returns null rather than a fabricated manifest when the edition does not exist', async () => {
    mockManifestRow(null);
    const manifest = await bookVersionManager.getManifest('missing', 'user-1');
    expect(manifest).toBeNull();
  });
});
