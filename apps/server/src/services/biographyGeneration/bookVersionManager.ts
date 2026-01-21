import crypto from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { biographyGenerationEngine } from './biographyGenerationEngine';
import type { Biography, BiographySpec, TimelineChapter } from './types';

export interface VersionComparison {
  baseId: string;
  versionId: string;
  differences: {
    chapterId: string;
    chapterTitle: string;
    differences: {
      type: 'content' | 'filtering' | 'structure';
      description: string;
    }[];
  }[];
  sharedTimeline: {
    chapters: TimelineChapter[];
    timeSpan: { start: string; end: string };
  };
}

export interface BiographyVersion {
  id: string;
  version: string;
  title: string;
  generatedAt: string;
  memorySnapshotAt: string;
  atomSnapshotHash: string;
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

      return {
        baseId: biographyId1,
        versionId: biographyId2,
        differences,
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
        .select('id, version, title, created_at, memory_snapshot_at, atom_snapshot_hash')
        .eq('user_id', userId)
        .eq('lorebook_name', lorebookName)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, lorebookName, userId }, 'Failed to get version history');
        return [];
      }

      return (data || []).map(bio => ({
        id: bio.id,
        version: bio.version || 'main',
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

    // Match chapters by time span
    const matchedChapters = new Map<string, { ch1: any; ch2: any }>();

    bio1.chapters.forEach(ch1 => {
      const match = bio2.chapters.find(
        ch2 => ch2.timeSpan.start === ch1.timeSpan.start && ch2.timeSpan.end === ch1.timeSpan.end
      );
      if (match) {
        matchedChapters.set(ch1.id, { ch1, ch2: match });
      }
    });

    // Compare matched chapters
    matchedChapters.forEach(({ ch1, ch2 }, chapterId) => {
      const chapterDiffs: VersionComparison['differences'][0]['differences'] = [];

      // Check content differences
      if (ch1.text !== ch2.text) {
        const lengthDiff = Math.abs(ch1.text.length - ch2.text.length);
        chapterDiffs.push({
          type: 'content',
          description: `Content length differs by ${lengthDiff} characters`
        });
      }

      // Check filtering differences
      const atoms1 = ch1.atoms?.length || 0;
      const atoms2 = ch2.atoms?.length || 0;
      if (atoms1 !== atoms2) {
        chapterDiffs.push({
          type: 'filtering',
          description: `Atom count differs: ${atoms1} vs ${atoms2}`
        });
      }

      // Check structure differences
      if (ch1.themes.join(',') !== ch2.themes.join(',')) {
        chapterDiffs.push({
          type: 'structure',
          description: 'Themes differ between versions'
        });
      }

      if (chapterDiffs.length > 0) {
        differences.push({
          chapterId,
          chapterTitle: ch1.title,
          differences: chapterDiffs
        });
      }
    });

    return differences;
  }
}

export const bookVersionManager = new BookVersionManager();
