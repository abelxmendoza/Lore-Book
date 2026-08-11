/**
 * Seeds synthetic edition lineage into the demo core lorebook store once per browser.
 */

import { buildDemoEditionFixtureRecords } from '../../mocks/editionVersioning';
import {
  listDemoCoreRecords,
  type DemoCoreLorebookRecord,
} from './demoCoreLorebookStore';
import { compiledBookToDemoLorebook, setForgeDemoBook } from './forgeDemoLibrary';
import type { StoryMemoryState } from './types';

const STORAGE_KEY = 'demo_core_lorebooks_v2';
const SEEDED_FLAG = 'demo_edition_fixtures_seeded_v1';

function emptyMemory(): StoryMemoryState {
  return {
    entities: {},
    connections: [],
    situations: [],
    atoms: [],
    domains: {
      romance: 0,
      relationships: 0,
      family: 0,
      career: 0,
      health: 0,
      creative: 0,
      social: 0,
      place: 0,
      identity: 0,
    },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turnsProcessed: 0,
  };
}

function writeRecords(records: DemoCoreLorebookRecord[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ records, lastPreset: 'rich' }),
  );
}

function registerReadableBooks(records: DemoCoreLorebookRecord[]): void {
  const memory = emptyMemory();
  for (const record of records) {
    const book = compiledBookToDemoLorebook(record.compiledBook, memory, {
      lorebookName: record.lorebookName,
      lorebookVersion: record.lorebookVersion,
      edition: record.edition,
    });
    // Library / VersionManager navigate by core record id, not compiled draft id.
    const readable = { ...book, id: record.id, outline: { ...book.outline, id: record.id } };
    setForgeDemoBook(readable);
    if (record.bookId !== record.id) {
      setForgeDemoBook({ ...readable, id: record.bookId, outline: { ...readable.outline, id: record.bookId } });
    }
  }
}

/**
 * Ensure demo edition fixtures exist so VersionManager / library History work offline.
 * Idempotent: only seeds when the store has no fixture publications yet.
 */
export function ensureDemoEditionFixturesSeeded(): DemoCoreLorebookRecord[] {
  if (typeof window === 'undefined') return [];

  const existing = listDemoCoreRecords();
  const hasFixtures = existing.some(
    (r) =>
      r.lorebookName === 'Career at Vanguard Robotics' ||
      r.lorebookName === 'Relationships — Jamie & Marcus',
  );

  if (hasFixtures) {
    registerReadableBooks(
      existing.filter(
        (r) =>
          r.lorebookName === 'Career at Vanguard Robotics' ||
          r.lorebookName === 'Relationships — Jamie & Marcus',
      ),
    );
    try {
      localStorage.setItem(SEEDED_FLAG, '1');
    } catch {
      /* ignore */
    }
    return existing;
  }

  const fixtures = buildDemoEditionFixtureRecords();
  const merged = [...existing, ...fixtures];
  writeRecords(merged);
  registerReadableBooks(fixtures);
  try {
    localStorage.setItem(SEEDED_FLAG, '1');
  } catch {
    /* ignore */
  }
  return merged;
}

export function resetDemoEditionFixturesForTests(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SEEDED_FLAG);
}
