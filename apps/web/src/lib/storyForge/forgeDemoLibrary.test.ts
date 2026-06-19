import { describe, it, expect, beforeEach } from 'vitest';

import {
  compiledBookToDemoLorebook,
  filterBookEdition,
  getForgeDemoBookById,
  registerForgeDemoBooks,
} from './forgeDemoLibrary';
import {
  buildForgeLibraryCatalog,
  generateDemoEdition,
  getDemoRecompileHint,
  groupDemoCoreByName,
  recompileDemoCoreLorebook,
  saveDemoCoreLorebook,
} from './demoCoreLorebookStore';
import { runStoryForgeBatch } from './storyForgeEngine';

describe('forgeDemoLibrary', () => {
  it('converts compiled draft to readable demo book', () => {
    const batch = runStoryForgeBatch(['weekend-presence']);
    const book = compiledBookToDemoLorebook(batch.mainBook, batch.combinedMemory, { edition: 'main' });
    expect(book.outline.sections.length).toBeGreaterThan(0);
    expect(book.chapters).toBe(batch.mainBook.chapters.length);
  });

  it('registers and resolves forge books by id', () => {
    const batch = runStoryForgeBatch(['career-connector']);
    const demo = compiledBookToDemoLorebook(batch.mainBook, batch.combinedMemory);
    registerForgeDemoBooks([demo]);
    expect(getForgeDemoBookById(demo.id)?.title).toBe(demo.title);
  });

  it('filters safe edition content', () => {
    const batch = runStoryForgeBatch(['breakup-processing']);
    const safe = filterBookEdition(batch.mainBook, batch.combinedMemory, 'safe');
    expect(safe.chapters.length).toBeLessThanOrEqual(batch.mainBook.chapters.length);
  });
});

describe('demoCoreLorebookStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds forge library catalog when compiled mode is on', () => {
    const { catalog, forge } = buildForgeLibraryCatalog('building', 'two');
    expect(forge.mainBook).toBeTruthy();
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('saves and recompiles core lorebook versions', () => {
    const { forge } = buildForgeLibraryCatalog('sparse', 'one');
    if (!forge.mainBook) return;

    saveDemoCoreLorebook('My Life Story', forge);
    expect(groupDemoCoreByName()['My Life Story']?.length).toBe(1);

    recompileDemoCoreLorebook('My Life Story');
    const versions = groupDemoCoreByName()['My Life Story']?.filter((r) => r.edition === 'main') ?? [];
    expect(versions.length).toBe(2);
    expect(versions[0].lorebookVersion).toBe(2);
  });

  it('generates demo edition variants', () => {
    const { forge } = buildForgeLibraryCatalog('building', 'one');
    if (!forge.mainBook) return;

    saveDemoCoreLorebook('Career Arc', forge);
    generateDemoEdition('Career Arc', 'safe', forge);
    const records = groupDemoCoreByName()['Career Arc'] ?? [];
    expect(records.some((r) => r.edition === 'safe')).toBe(true);
  });

  it('detects when recompile is available after memory grows', () => {
    const sparse = buildForgeLibraryCatalog('sparse', 'one');
    if (!sparse.forge.mainBook) return;

    saveDemoCoreLorebook('Growing Story', sparse.forge);
    const rich = buildForgeLibraryCatalog('rich', 'one');
    const hint = getDemoRecompileHint('Growing Story', rich.forge);
    expect(hint?.available).toBe(true);
    expect(hint?.nextVersion).toBe(2);
  });
});
