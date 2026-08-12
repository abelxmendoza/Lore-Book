import { describe, it, expect } from 'vitest';
import { compareDemoEditions } from './demoCoreLorebookStore';
import type { CompiledBookDraft, CompiledBookChapter } from './types';

function chapter(overrides: Partial<CompiledBookChapter> & { id: string; title: string }): CompiledBookChapter {
  return {
    summary: 'A chapter summary.',
    atomIds: ['atom-1'],
    domain: 'identity',
    ...overrides,
  };
}

function book(overrides: Partial<CompiledBookDraft> & { id: string; chapters: CompiledBookChapter[] }): CompiledBookDraft {
  return {
    title: 'Test Book',
    subtitle: '',
    versions: [],
    latestVersion: {
      version: 1,
      compiledAt: '2026-01-01T00:00:00.000Z',
      atomCount: 10,
      entityCount: 2,
      connectionCount: 1,
      situationCount: 1,
      sourceTurns: 5,
      snapshotHash: 'hash-1',
    },
    ...overrides,
  };
}

describe('compareDemoEditions', () => {
  it('flags a chapter present only in the target edition as added', () => {
    const base = book({
      id: 'base',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One' })],
    });
    const target = book({
      id: 'target',
      chapters: [
        chapter({ id: 'ch-1', title: 'Chapter One' }),
        chapter({ id: 'ch-2', title: 'Chapter Two' }),
      ],
    });

    const result = compareDemoEditions(base, target);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0]).toMatchObject({ chapterTitle: 'Chapter Two', changeType: 'added' });
  });

  it('flags a chapter present only in the base edition as removed', () => {
    const base = book({
      id: 'base',
      chapters: [
        chapter({ id: 'ch-1', title: 'Chapter One' }),
        chapter({ id: 'ch-2', title: 'Chapter Two' }),
      ],
    });
    const target = book({
      id: 'target',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One' })],
    });

    const result = compareDemoEditions(base, target);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0]).toMatchObject({ chapterTitle: 'Chapter Two', changeType: 'removed' });
  });

  it('flags a same-titled chapter with a different summary as changed', () => {
    const base = book({
      id: 'base',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One', summary: 'Original summary.' })],
    });
    const target = book({
      id: 'target',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One', summary: 'Updated summary.' })],
    });

    const result = compareDemoEditions(base, target);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0]).toMatchObject({ chapterTitle: 'Chapter One', changeType: 'changed' });
  });

  it('reports no differences for identical editions', () => {
    const base = book({
      id: 'base',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One' })],
    });
    const target = book({
      id: 'target',
      chapters: [chapter({ id: 'ch-1', title: 'Chapter One' })],
    });

    const result = compareDemoEditions(base, target);
    expect(result.differences).toHaveLength(0);
    expect(result.metadataChanges).toHaveLength(0);
  });

  it('records a metadata change when the title differs', () => {
    const base = book({ id: 'base', title: 'Old Title', chapters: [] });
    const target = book({ id: 'target', title: 'New Title', chapters: [] });

    const result = compareDemoEditions(base, target);
    expect(result.metadataChanges).toContain('Title changed to "New Title".');
  });

  it('carries the shared timeline span from base and target compiledAt', () => {
    const base = book({
      id: 'base',
      chapters: [],
      latestVersion: {
        version: 1,
        compiledAt: '2026-01-01T00:00:00.000Z',
        atomCount: 5,
        entityCount: 1,
        connectionCount: 0,
        situationCount: 0,
        sourceTurns: 2,
        snapshotHash: 'hash-a',
      },
    });
    const target = book({
      id: 'target',
      chapters: [],
      latestVersion: {
        version: 2,
        compiledAt: '2026-02-01T00:00:00.000Z',
        atomCount: 8,
        entityCount: 2,
        connectionCount: 1,
        situationCount: 0,
        sourceTurns: 4,
        snapshotHash: 'hash-b',
      },
    });

    const result = compareDemoEditions(base, target);
    expect(result.sharedTimeline.timeSpan).toEqual({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-02-01T00:00:00.000Z',
    });
  });
});
