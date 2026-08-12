/**
 * Demo-mode stubs for LoreBook edition versioning APIs.
 * Shapes match VersionManager / bookVersionManager contracts without network calls.
 */

import {
  getDemoVersionsForName,
  listDemoCoreRecords,
  type DemoCoreLorebookRecord,
} from '../lib/storyForge/demoCoreLorebookStore';
import { ensureDemoEditionFixturesSeeded } from '../lib/storyForge/demoEditionFixtures';

export type DemoBiographyVersion = {
  id: string;
  version: string;
  lorebookVersion?: number;
  status?: 'published' | 'superseded';
  title: string;
  generatedAt: string;
  memorySnapshotAt: string;
  atomSnapshotHash: string;
  baseBiographyId?: string;
};

export type DemoChapterChangeType = 'added' | 'removed' | 'changed' | 'reordered';

export type DemoVersionComparison = {
  baseId: string;
  versionId: string;
  differences: Array<{
    chapterId: string;
    chapterTitle: string;
    changeType: DemoChapterChangeType;
    differences: Array<{
      type: 'content' | 'filtering' | 'structure' | 'position';
      description: string;
    }>;
  }>;
  metadataChanges: string[];
  sharedTimeline: {
    chapters: unknown[];
    timeSpan: { start: string; end: string };
  };
};

export type DemoEditionManifest = {
  editionId: string;
  publicationHandle: string | null;
  lorebookVersion: number | null;
  knowledgeSnapshot: {
    atomCount: number;
    atomSnapshotHash: string | null;
    memorySnapshotAt: string | null;
  };
  buildSettings: {
    buildFlag: string | null;
    scope: string | null;
    tone: string | null;
    depth: string | null;
    audience: string | null;
    form?: string;
  };
  filtersApplied: string[];
  generatorVersion: string | null;
  promptVersion: string | null;
  modelVersion: string | null;
  filterVersion: string | null;
};

function findRecord(id: string): DemoCoreLorebookRecord | undefined {
  ensureDemoEditionFixturesSeeded();
  return listDemoCoreRecords().find((r) => r.id === id || r.bookId === id);
}

export function getDemoVersionHistory(lorebookName: string): { versions: DemoBiographyVersion[] } {
  ensureDemoEditionFixturesSeeded();
  const records = getDemoVersionsForName(lorebookName).filter((r) => r.edition === 'main');
  const latest = records[0]?.lorebookVersion ?? 0;

  const versions = records.map((record) => ({
    id: record.id,
    version: record.edition,
    lorebookVersion: record.lorebookVersion,
    status: (record.lorebookVersion === latest ? 'published' : 'superseded') as 'published' | 'superseded',
    title: record.compiledBook.title,
    generatedAt: record.createdAt,
    memorySnapshotAt: record.compiledBook.latestVersion.compiledAt,
    atomSnapshotHash: record.snapshotHash,
    baseBiographyId: records.find((r) => r.lorebookVersion === 1)?.id,
  }));

  return { versions };
}

export function getDemoManifest(editionId: string): { manifest: DemoEditionManifest } | null {
  const record = findRecord(editionId);
  if (!record) return null;

  const lv = record.compiledBook.latestVersion;
  return {
    manifest: {
      editionId: record.id,
      publicationHandle: record.lorebookName,
      lorebookVersion: record.lorebookVersion,
      knowledgeSnapshot: {
        atomCount: lv.atomCount,
        atomSnapshotHash: record.snapshotHash,
        memorySnapshotAt: lv.compiledAt,
      },
      buildSettings: {
        buildFlag: record.edition,
        scope: record.edition === 'main' ? 'full' : record.edition,
        tone: 'reflective',
        depth: 'standard',
        audience: 'self',
        form: 'memoir',
      },
      filtersApplied: record.edition === 'main' ? [] : [`edition:${record.edition}`],
      // Milestone 1 leaves provenance stamps unset in real builds; demo mirrors that.
      generatorVersion: null,
      promptVersion: null,
      modelVersion: null,
      filterVersion: null,
    },
  };
}

export function compareDemoVersions(
  biographyId1: string,
  biographyId2: string,
): { comparison: DemoVersionComparison } | null {
  const a = findRecord(biographyId1);
  const b = findRecord(biographyId2);
  if (!a || !b) return null;

  const [from, to] =
    a.lorebookVersion <= b.lorebookVersion ? [a, b] : [b, a];

  const fromChapters = from.compiledBook.chapters;
  const toChapters = to.compiledBook.chapters;
  const fromById = new Map(fromChapters.map((c, index) => [c.id, { chapter: c, index }]));
  const toById = new Map(toChapters.map((c, index) => [c.id, { chapter: c, index }]));

  const differences: DemoVersionComparison['differences'] = [];

  for (const [id, { chapter, index }] of toById) {
    const prior = fromById.get(id);
    if (!prior) {
      differences.push({
        chapterId: id,
        chapterTitle: chapter.title,
        changeType: 'added',
        differences: [{ type: 'structure', description: 'New chapter' }],
      });
      continue;
    }

    const chapterDiffs: DemoVersionComparison['differences'][0]['differences'] = [];
    if (prior.chapter.summary !== chapter.summary || prior.chapter.title !== chapter.title) {
      chapterDiffs.push({
        type: 'content',
        description: 'Chapter text or title changed between editions',
      });
    }
    if (prior.index !== index) {
      chapterDiffs.push({
        type: 'position',
        description: `Moved from position ${prior.index + 1} to ${index + 1}`,
      });
    }
    if (chapterDiffs.length > 0) {
      const changeType: DemoChapterChangeType = chapterDiffs.some((d) => d.type === 'position')
        && !chapterDiffs.some((d) => d.type === 'content')
        ? 'reordered'
        : 'changed';
      differences.push({
        chapterId: id,
        chapterTitle: chapter.title,
        changeType,
        differences: chapterDiffs,
      });
    }
  }

  for (const [id, { chapter }] of fromById) {
    if (!toById.has(id)) {
      differences.push({
        chapterId: id,
        chapterTitle: chapter.title,
        changeType: 'removed',
        differences: [{ type: 'structure', description: 'Chapter no longer present' }],
      });
    }
  }

  const metadataChanges: string[] = [];
  if (from.compiledBook.subtitle !== to.compiledBook.subtitle) {
    metadataChanges.push(`Subtitle: “${from.compiledBook.subtitle}” → “${to.compiledBook.subtitle}”`);
  }
  if (from.snapshotHash !== to.snapshotHash) {
    metadataChanges.push('Knowledge snapshot hash changed');
  }
  if (from.compiledBook.latestVersion.atomCount !== to.compiledBook.latestVersion.atomCount) {
    metadataChanges.push(
      `Atom count: ${from.compiledBook.latestVersion.atomCount} → ${to.compiledBook.latestVersion.atomCount}`,
    );
  }

  const sharedIds = toChapters.filter((c) => fromById.has(c.id)).map((c) => c.id);

  return {
    comparison: {
      baseId: from.id,
      versionId: to.id,
      differences,
      metadataChanges,
      sharedTimeline: {
        chapters: sharedIds,
        timeSpan: {
          start: from.createdAt,
          end: to.createdAt,
        },
      },
    },
  };
}
