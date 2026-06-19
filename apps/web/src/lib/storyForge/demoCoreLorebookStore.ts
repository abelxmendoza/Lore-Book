import type { CompiledBookDraft } from './types';
import { compiledBookToDemoLorebook, filterBookEdition, registerForgeDemoBooks } from './forgeDemoLibrary';
import type { ForgeReadinessSnapshot } from './forgeReadinessBridge';
import { runForgeForPreset } from './forgeReadinessBridge';
import type { LoreReadinessKnowledgePreset } from '../../mocks/loreReadiness';
import type { DemoLorebook, DemoLorebookCatalogEntry } from '../../mocks/lorebooks';
import { forgeBooksToCatalog } from './forgeDemoLibrary';

const STORAGE_KEY = 'demo_core_lorebooks_v2';

export type DemoEdition = 'main' | 'safe' | 'explicit' | 'private';

export type DemoCoreLorebookRecord = {
  id: string;
  lorebookName: string;
  lorebookVersion: number;
  edition: DemoEdition;
  bookId: string;
  compiledBook: CompiledBookDraft;
  createdAt: string;
  snapshotHash: string;
};

type DemoCoreStore = {
  records: DemoCoreLorebookRecord[];
  /** Last forge preset used — recompile bumps scenario count */
  lastPreset: LoreReadinessKnowledgePreset;
};

function readStore(): DemoCoreStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], lastPreset: 'rich' };
    return JSON.parse(raw) as DemoCoreStore;
  } catch {
    return { records: [], lastPreset: 'rich' };
  }
}

function writeStore(store: DemoCoreStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listDemoCoreRecords(): DemoCoreLorebookRecord[] {
  return readStore().records;
}

export function groupDemoCoreByName(): Record<string, DemoCoreLorebookRecord[]> {
  const groups: Record<string, DemoCoreLorebookRecord[]> = {};
  for (const record of listDemoCoreRecords()) {
    const list = groups[record.lorebookName] ?? [];
    list.push(record);
    groups[record.lorebookName] = list;
  }
  for (const name of Object.keys(groups)) {
    groups[name].sort((a, b) => b.lorebookVersion - a.lorebookVersion);
  }
  return groups;
}

export function getDemoVersionsForName(lorebookName: string): DemoCoreLorebookRecord[] {
  return listDemoCoreRecords()
    .filter((r) => r.lorebookName === lorebookName)
    .sort((a, b) => {
      if (a.lorebookVersion !== b.lorebookVersion) return b.lorebookVersion - a.lorebookVersion;
      return a.edition.localeCompare(b.edition);
    });
}

/** Build forge-readable books and register in cache. */
export function syncForgeDemoLibrary(forge: ForgeReadinessSnapshot): DemoLorebook[] {
  if (!forge.mainBook || !forge.memory) {
    registerForgeDemoBooks([]);
    return [];
  }

  const books: DemoLorebook[] = [
    compiledBookToDemoLorebook(forge.mainBook, forge.memory, {
      lorebookVersion: forge.mainBook.latestVersion.version,
      edition: 'main',
      lorebookName: forge.mainBook.title,
    }),
  ];

  for (const domainBook of forge.domainBooks) {
    books.push(
      compiledBookToDemoLorebook(domainBook, forge.memory, {
        edition: 'main',
        lorebookName: domainBook.title,
      })
    );
  }

  for (const record of listDemoCoreRecords()) {
    if (!forge.memory) continue;
    const base =
      record.edition === 'main'
        ? record.compiledBook
        : filterBookEdition(record.compiledBook, forge.memory, record.edition);
    books.push(
      compiledBookToDemoLorebook(base, forge.memory, {
        lorebookName: record.lorebookName,
        lorebookVersion: record.lorebookVersion,
        edition: record.edition,
      })
    );
  }

  registerForgeDemoBooks(books);
  return books;
}

export function buildForgeLibraryCatalog(
  preset: LoreReadinessKnowledgePreset,
  compiledMode: 'none' | 'one' | 'two'
): { books: DemoLorebook[]; catalog: DemoLorebookCatalogEntry[]; forge: ForgeReadinessSnapshot } {
  const forge = runForgeForPreset(preset);
  if (compiledMode === 'none' || !forge.mainBook) {
    registerForgeDemoBooks([]);
    return { books: [], catalog: [], forge };
  }

  const books = syncForgeDemoLibrary(forge);
  const catalog = forgeBooksToCatalog(books);
  return { books, catalog, forge };
}

/** Save current forge main book as a named Core Lorebook (demo). */
export function saveDemoCoreLorebook(
  lorebookName: string,
  forge: ForgeReadinessSnapshot
): DemoCoreLorebookRecord | null {
  if (!forge.mainBook) return null;

  const store = readStore();
  const existing = store.records.filter((r) => r.lorebookName === lorebookName && r.edition === 'main');
  const nextVersion =
    existing.length > 0 ? Math.max(...existing.map((r) => r.lorebookVersion)) + 1 : 1;

  const record: DemoCoreLorebookRecord = {
    id: `demo-core-${lorebookName}-${nextVersion}`,
    lorebookName,
    lorebookVersion: nextVersion,
    edition: 'main',
    bookId: `${forge.mainBook.id}-v${nextVersion}`,
    compiledBook: {
      ...forge.mainBook,
      id: `${forge.mainBook.id}-v${nextVersion}`,
      title: lorebookName,
      latestVersion: { ...forge.mainBook.latestVersion, version: nextVersion },
    },
    createdAt: new Date().toISOString(),
    snapshotHash: forge.mainBook.latestVersion.snapshotHash,
  };

  store.records.push(record);
  store.lastPreset = presetFromForge(forge);
  writeStore(store);
  syncForgeDemoLibrary(forge);
  return record;
}

/** Re-compile: run forge with more chat scenarios → new version number. */
export function recompileDemoCoreLorebook(lorebookName: string): ForgeReadinessSnapshot | null {
  const store = readStore();
  const versions = store.records.filter((r) => r.lorebookName === lorebookName && r.edition === 'main');
  if (versions.length === 0) return null;

  const nextPreset = bumpPreset(store.lastPreset);
  const forge = runForgeForPreset(nextPreset);
  if (!forge.mainBook) return null;

  const nextVersion = Math.max(...versions.map((v) => v.lorebookVersion)) + 1;
  const record: DemoCoreLorebookRecord = {
    id: `demo-core-${lorebookName}-${nextVersion}`,
    lorebookName,
    lorebookVersion: nextVersion,
    edition: 'main',
    bookId: `${forge.mainBook.id}-v${nextVersion}`,
    compiledBook: {
      ...forge.mainBook,
      id: `${forge.mainBook.id}-v${nextVersion}`,
      title: lorebookName,
      latestVersion: { ...forge.mainBook.latestVersion, version: nextVersion },
    },
    createdAt: new Date().toISOString(),
    snapshotHash: forge.mainBook.latestVersion.snapshotHash,
  };

  store.records.push(record);
  store.lastPreset = nextPreset;
  writeStore(store);
  syncForgeDemoLibrary(forge);
  return forge;
}

/** Generate safe/explicit/private edition from latest main version (demo). */
export function generateDemoEdition(
  lorebookName: string,
  edition: 'safe' | 'explicit' | 'private',
  forge: ForgeReadinessSnapshot
): DemoCoreLorebookRecord | null {
  if (!forge.memory) return null;

  const store = readStore();
  const main = store.records
    .filter((r) => r.lorebookName === lorebookName && r.edition === 'main')
    .sort((a, b) => b.lorebookVersion - a.lorebookVersion)[0];
  if (!main) return null;

  if (store.records.some((r) => r.lorebookName === lorebookName && r.edition === edition)) {
    return null;
  }

  const filtered = filterBookEdition(main.compiledBook, forge.memory, edition);
  const record: DemoCoreLorebookRecord = {
    id: `demo-core-${lorebookName}-${edition}`,
    lorebookName,
    lorebookVersion: main.lorebookVersion,
    edition,
    bookId: filtered.id,
    compiledBook: filtered,
    createdAt: new Date().toISOString(),
    snapshotHash: main.snapshotHash,
  };

  store.records.push(record);
  writeStore(store);
  syncForgeDemoLibrary(forge);
  return record;
}

function presetFromForge(forge: ForgeReadinessSnapshot): LoreReadinessKnowledgePreset {
  const turns = forge.memory?.turnsProcessed ?? 0;
  if (turns === 0) return 'empty';
  if (turns <= 6) return 'sparse';
  if (turns <= 15) return 'building';
  return 'rich';
}

function bumpPreset(preset: LoreReadinessKnowledgePreset): LoreReadinessKnowledgePreset {
  if (preset === 'empty') return 'sparse';
  if (preset === 'sparse') return 'building';
  if (preset === 'building') return 'rich';
  return 'rich';
}

/** True when live forge memory differs from the latest saved core snapshot. */
export function getDemoRecompileHint(
  lorebookName: string,
  forge: ForgeReadinessSnapshot | null
): { available: boolean; nextVersion: number; newTurns: number } | null {
  if (!forge?.mainBook?.latestVersion.snapshotHash) return null;

  const mainRecords = listDemoCoreRecords()
    .filter((r) => r.lorebookName === lorebookName && r.edition === 'main')
    .sort((a, b) => b.lorebookVersion - a.lorebookVersion);

  if (mainRecords.length === 0) return null;

  const latest = mainRecords[0];
  const liveHash = forge.mainBook.latestVersion.snapshotHash;
  const newTurns = (forge.memory?.turnsProcessed ?? 0) - (latest.compiledBook.latestVersion.sourceTurns ?? 0);

  if (latest.snapshotHash === liveHash && newTurns <= 0) return null;

  return {
    available: true,
    nextVersion: latest.lorebookVersion + 1,
    newTurns: Math.max(newTurns, 1),
  };
}

export function getLatestDemoCoreBookId(lorebookName: string, edition: DemoEdition = 'main'): string | null {
  const records = getDemoVersionsForName(lorebookName).filter((r) => r.edition === edition);
  return records[0]?.bookId ?? null;
}
