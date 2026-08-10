import crypto from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { biographyGenerationEngine } from './biographyGenerationEngine';
import type { Biography, BiographySpec, TimelineChapter } from './types';

/** Chapter-level change category — the Difference Contract (Blueprint 20). */
export type ChapterChangeType = 'added' | 'removed' | 'changed' | 'reordered';

export interface VersionComparison {
  baseId: string;
  versionId: string;
  differences: {
    chapterId: string;
    chapterTitle: string;
    changeType: ChapterChangeType;
    differences: {
      type: 'content' | 'filtering' | 'structure' | 'position';
      description: string;
    }[];
  }[];
  metadataChanges: string[];
  sharedTimeline: {
    chapters: TimelineChapter[];
    timeSpan: { start: string; end: string };
  };
}

export interface BiographyVersion {
  id: string;
  /** Build flag (main/safe/explicit/private) — a different axis from edition lineage. */
  version: string;
  /** Core Lorebook edition number (`lorebook_version`); undefined for non-core biographies. */
  lorebookVersion?: number;
  status?: 'published' | 'superseded';
  title: string;
  generatedAt: string;
  memorySnapshotAt: string;
  atomSnapshotHash: string;
  baseBiographyId?: string;
}

/** Explains how an edition was produced — the Manifest Contract (Blueprint 20). */
export interface EditionManifest {
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
  /** Not yet instrumented in the generation engine — honestly reported as null rather than guessed. */
  generatorVersion: string | null;
  promptVersion: string | null;
  modelVersion: string | null;
  filterVersion: string | null;
}

/**
 * Indices (into `seq`) of one longest strictly-increasing subsequence,
 * via patience-sorting in O(n log n). Used to tell which common chapters
 * kept their relative order across two editions versus which ones moved —
 * a plain index comparison breaks the moment a chapter is also added or
 * removed, since that shifts every downstream absolute index.
 */
function longestIncreasingSubsequenceIndices(seq: number[]): Set<number> {
  const n = seq.length;
  if (n === 0) return new Set();
  const predecessor = new Array<number>(n).fill(-1);
  const pileTops: number[] = []; // pileTops[k] = index into seq of the smallest tail of an increasing run of length k+1
  for (let i = 0; i < n; i++) {
    let lo = 0;
    let hi = pileTops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[pileTops[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) predecessor[i] = pileTops[lo - 1];
    pileTops[lo] = i;
  }
  const result = new Set<number>();
  let cursor = pileTops[pileTops.length - 1];
  while (cursor !== -1) {
    result.add(cursor);
    cursor = predecessor[cursor];
  }
  return result;
}

/**
 * Book Version Manager
 * Manages biography versions, preserves chronology, enables version comparison
 */
export class BookVersionManager {
  /**
   * Generate alternative version from base biography
   */
  async generateVersion(
    userId: string,
    baseBiographyId: string,
    versionType: 'safe' | 'explicit' | 'private'
  ): Promise<Biography> {
    try {
      // Get base biography
      const { data: baseBiographyData, error: fetchError } = await supabaseAdmin
        .from('biographies')
        .select('*')
        .eq('id', baseBiographyId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !baseBiographyData) {
        throw new Error('Base biography not found');
      }

      const baseBiography = baseBiographyData.biography_data as Biography;
      const baseSpec = baseBiography.metadata.spec;

      // Create new spec with different version
      const newSpec: BiographySpec = {
        ...baseSpec,
        version: versionType,
        includeIntrospection: versionType === 'private'
      };

      // Generate new version (will preserve chronology through same spec structure)
      const newBiography = await biographyGenerationEngine.generateBiography(userId, newSpec);

      // Link to base biography
      await this.linkVersions(baseBiographyId, newBiography.id);

      // Preserve memory snapshot from base
      if (baseBiographyData.memory_snapshot_at) {
        await supabaseAdmin
          .from('biographies')
          .update({
            memory_snapshot_at: baseBiographyData.memory_snapshot_at,
            base_biography_id: baseBiographyId
          })
          .eq('id', newBiography.id);
      }

      logger.info(
        { userId, baseBiographyId, versionType, newBiographyId: newBiography.id },
        'Generated alternative version'
      );

      return newBiography;
    } catch (error) {
      logger.error({ error, userId, baseBiographyId, versionType }, 'Failed to generate version');
      throw error;
    }
  }

  /**
   * Preserve chronology in biography
   * Ensures timeline structure is consistent
   */
  preserveChronology(biography: Biography): Biography {
    // Sort chapters by time span
    const sortedChapters = [...biography.chapters].sort((a, b) => {
      const aStart = new Date(a.timeSpan.start).getTime();
      const bStart = new Date(b.timeSpan.start).getTime();
      return aStart - bStart;
    });

    return {
      ...biography,
      chapters: sortedChapters
    };
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    biographyId1: string,
    biographyId2: string,
    userId: string
  ): Promise<VersionComparison> {
    try {
      const [bio1, bio2] = await Promise.all([
        this.getBiography(biographyId1, userId),
        this.getBiography(biographyId2, userId)
      ]);

      if (!bio1 || !bio2) {
        throw new Error('One or both biographies not found');
      }

      // Find shared timeline
      const sharedTimeline = this.extractSharedTimeline(bio1, bio2);

      // Compare chapters
      const differences = this.compareChapters(bio1, bio2);
      const metadataChanges = this.compareMetadata(bio1, bio2);

      return {
        baseId: biographyId1,
        versionId: biographyId2,
        differences,
        metadataChanges,
        sharedTimeline
      };
    } catch (error) {
      logger.error({ error, biographyId1, biographyId2, userId }, 'Failed to compare versions');
      throw error;
    }
  }

  /**
   * Get version history for a lorebook
   */
  async getVersionHistory(lorebookName: string, userId: string): Promise<BiographyVersion[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('biographies')
        .select('id, version, lorebook_version, base_biography_id, title, created_at, memory_snapshot_at, atom_snapshot_hash')
        .eq('user_id', userId)
        .eq('lorebook_name', lorebookName)
        .order('lorebook_version', { ascending: false });

      if (error) {
        logger.error({ error, lorebookName, userId }, 'Failed to get version history');
        return [];
      }

      const rows = data || [];
      // The highest lorebook_version for this handle is the currently active
      // edition; every other row has been superseded by a later recompile.
      const maxVersion = rows.reduce((max, bio) => Math.max(max, bio.lorebook_version ?? 1), 0);

      return rows.map(bio => ({
        id: bio.id,
        version: bio.version || 'main',
        lorebookVersion: bio.lorebook_version ?? undefined,
        status: (bio.lorebook_version ?? 1) >= maxVersion ? 'published' as const : 'superseded' as const,
        baseBiographyId: bio.base_biography_id ?? undefined,
        title: bio.title,
        generatedAt: bio.created_at,
        memorySnapshotAt: bio.memory_snapshot_at || bio.created_at,
        atomSnapshotHash: bio.atom_snapshot_hash || ''
      }));
    } catch (error) {
      logger.error({ error, lorebookName, userId }, 'Failed to get version history');
      return [];
    }
  }

  /**
   * Explain how an edition was produced (Manifest Contract, Blueprint 20).
   * Built entirely from columns and biography_data that already exist —
   * generator/prompt/model/filter version are reported as null rather than
   * guessed, since the generation engine does not yet stamp them.
   */
  async getManifest(biographyId: string, userId: string): Promise<EditionManifest | null> {
    const { data, error } = await supabaseAdmin
      .from('biographies')
      .select('id, lorebook_name, lorebook_version, version, memory_snapshot_at, atom_snapshot_hash, biography_data')
      .eq('id', biographyId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      logger.error({ error, biographyId, userId }, 'Failed to load manifest');
      return null;
    }

    const bio = data.biography_data as Biography;
    const spec = bio?.metadata?.spec;

    return {
      editionId: data.id,
      publicationHandle: data.lorebook_name ?? null,
      lorebookVersion: data.lorebook_version ?? null,
      knowledgeSnapshot: {
        atomCount: bio?.metadata?.atomCount ?? 0,
        atomSnapshotHash: data.atom_snapshot_hash ?? null,
        memorySnapshotAt: data.memory_snapshot_at ?? bio?.metadata?.memorySnapshotAt ?? null,
      },
      buildSettings: {
        buildFlag: data.version ?? spec?.version ?? null,
        scope: spec?.scope ?? null,
        tone: spec?.tone ?? null,
        depth: spec?.depth ?? null,
        audience: spec?.audience ?? null,
        form: spec?.form,
      },
      filtersApplied: bio?.metadata?.filtersApplied ?? [],
      generatorVersion: null,
      promptVersion: null,
      modelVersion: null,
      filterVersion: null,
    };
  }

  /**
   * Link versions together
   */
  async linkVersions(baseId: string, versionId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('biographies')
        .update({ base_biography_id: baseId })
        .eq('id', versionId);
    } catch (error) {
      logger.error({ error, baseId, versionId }, 'Failed to link versions');
      throw error;
    }
  }

  /**
   * Get all versions of a biography
   */
  async getAllVersions(baseBiographyId: string, userId: string): Promise<Biography[]> {
    try {
      // Get base biography
      const base = await this.getBiography(baseBiographyId, userId);
      if (!base) {
        return [];
      }

      // Get all linked versions
      const { data, error } = await supabaseAdmin
        .from('biographies')
        .select('biography_data')
        .eq('user_id', userId)
        .or(`id.eq.${baseBiographyId},base_biography_id.eq.${baseBiographyId}`)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error({ error, baseBiographyId, userId }, 'Failed to get all versions');
        return [base];
      }

      const versions = (data || []).map(b => b.biography_data as Biography);
      return versions.length > 0 ? versions : [base];
    } catch (error) {
      logger.error({ error, baseBiographyId, userId }, 'Failed to get all versions');
      return [];
    }
  }

  /**
   * Generate atom snapshot hash
   */
  generateAtomSnapshotHash(atoms: any[]): string {
    const atomIds = atoms.map(a => a.id || a).sort().join(',');
    return crypto.createHash('sha256').update(atomIds).digest('hex');
  }

  /**
   * Helper: Get biography from database
   */
  private async getBiography(biographyId: string, userId: string): Promise<Biography | null> {
    const { data, error } = await supabaseAdmin
      .from('biographies')
      .select('biography_data')
      .eq('id', biographyId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.biography_data as Biography;
  }

  /**
   * Extract shared timeline from two biographies
   */
  private extractSharedTimeline(bio1: Biography, bio2: Biography): {
    chapters: TimelineChapter[];
    timeSpan: { start: string; end: string };
  } {
    // Use timeline chapters from metadata if available
    const chapters1 = bio1.chapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      start_date: ch.timeSpan.start,
      end_date: ch.timeSpan.end,
      description: ch.themes.join(', '),
      summary: ch.text.substring(0, 200)
    }));

    // Find earliest and latest dates
    const allDates = [
      ...bio1.chapters.map(ch => ch.timeSpan.start),
      ...bio1.chapters.map(ch => ch.timeSpan.end),
      ...bio2.chapters.map(ch => ch.timeSpan.start),
      ...bio2.chapters.map(ch => ch.timeSpan.end)
    ].filter(Boolean);

    const sortedDates = allDates.sort();
    const start = sortedDates[0] || new Date().toISOString();
    const end = sortedDates[sortedDates.length - 1] || new Date().toISOString();

    return {
      chapters: chapters1 as any,
      timeSpan: { start, end }
    };
  }

  /**
   * Compare chapters between two biographies
   */
  private compareChapters(bio1: Biography, bio2: Biography): VersionComparison['differences'] {
    const differences: VersionComparison['differences'] = [];

    // Chapter ids are stable across recompiles (they derive from the underlying
    // timeline chapter, not from generation order), so identity — not incidental
    // timeSpan equality — is the correct match key. A timeSpan-only match would
    // silently drop chapters whose boundaries shifted even slightly, and would
    // never report a chapter as added or removed, only "changed" among whatever
    // happened to line up.
    const bio1ById = new Map(bio1.chapters.map((ch, index) => [ch.id, { ch, index }]));
    const bio2ById = new Map(bio2.chapters.map((ch, index) => [ch.id, { ch, index }]));

    // A chapter's raw array index is not a valid reorder signal on its own:
    // adding or removing any OTHER chapter shifts everyone's absolute index,
    // producing false positives and false negatives. What actually indicates
    // a move is whether a chapter's position relative to the other chapters
    // common to both editions changed — the standard way to test that is the
    // longest increasing subsequence (LIS) of common chapters' target-order
    // positions, traversed in source order. Chapters inside the LIS kept
    // their relative order (stable); chapters outside it are the minimal set
    // that actually moved.
    const commonIdsInBio1Order = bio1.chapters.map((ch) => ch.id).filter((id) => bio2ById.has(id));
    const targetIndexSequence = commonIdsInBio1Order.map((id) => bio2ById.get(id)!.index);
    const stableIds = new Set(
      Array.from(longestIncreasingSubsequenceIndices(targetIndexSequence), (i) => commonIdsInBio1Order[i]),
    );

    for (const [chapterId, { ch: ch2 }] of bio2ById) {
      const prior = bio1ById.get(chapterId);
      if (!prior) {
        differences.push({
          chapterId,
          chapterTitle: ch2.title,
          changeType: 'added',
          differences: [{ type: 'structure', description: 'New chapter' }],
        });
        continue;
      }

      const { ch: ch1, index: index1 } = prior;
      const chapterDiffs: VersionComparison['differences'][0]['differences'] = [];

      if (ch1.text !== ch2.text) {
        const lengthDiff = Math.abs(ch1.text.length - ch2.text.length);
        chapterDiffs.push({
          type: 'content',
          description: `Content length differs by ${lengthDiff} characters`,
        });
      }

      const atoms1 = ch1.atoms?.length || 0;
      const atoms2 = ch2.atoms?.length || 0;
      if (atoms1 !== atoms2) {
        chapterDiffs.push({
          type: 'filtering',
          description: `Atom count differs: ${atoms1} vs ${atoms2}`,
        });
      }

      if (ch1.themes.join(',') !== ch2.themes.join(',')) {
        chapterDiffs.push({
          type: 'structure',
          description: 'Themes differ between versions',
        });
      }

      if (chapterDiffs.length > 0) {
        differences.push({
          chapterId,
          chapterTitle: ch2.title,
          changeType: 'changed',
          differences: chapterDiffs,
        });
      } else if (!stableIds.has(chapterId)) {
        differences.push({
          chapterId,
          chapterTitle: ch2.title,
          changeType: 'reordered',
          differences: [
            { type: 'position', description: `Moved relative to surrounding chapters (was position ${index1 + 1})` },
          ],
        });
      }
    }

    for (const [chapterId, { ch: ch1 }] of bio1ById) {
      if (!bio2ById.has(chapterId)) {
        differences.push({
          chapterId,
          chapterTitle: ch1.title,
          changeType: 'removed',
          differences: [{ type: 'structure', description: 'Chapter no longer present' }],
        });
      }
    }

    return differences;
  }

  /**
   * Book-level (non-chapter) changes: title, subtitle, and knowledge-atom
   * coverage. Kept separate from chapter differences because these describe
   * the edition as a whole, not any single chapter.
   */
  private compareMetadata(bio1: Biography, bio2: Biography): string[] {
    const changes: string[] = [];
    if (bio1.title !== bio2.title) {
      changes.push(`Title: "${bio1.title}" → "${bio2.title}"`);
    }
    if ((bio1.subtitle ?? '') !== (bio2.subtitle ?? '')) {
      changes.push('Subtitle changed');
    }
    const atoms1 = bio1.metadata?.atomCount ?? 0;
    const atoms2 = bio2.metadata?.atomCount ?? 0;
    if (atoms1 !== atoms2) {
      changes.push(`Knowledge atoms: ${atoms1} → ${atoms2}`);
    }
    return changes;
  }
}

export const bookVersionManager = new BookVersionManager();
