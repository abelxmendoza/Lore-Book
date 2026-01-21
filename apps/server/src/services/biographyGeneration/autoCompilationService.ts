import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { biographyGenerationEngine } from './biographyGenerationEngine';
import { bookVersionManager } from './bookVersionManager';
import type { Biography, BiographySpec, TimelineChapter } from './types';

export interface BiographyVersions {
  base: Biography; // Main version
  safe?: Biography; // Safe version
  explicit?: Biography; // Explicit version
  private?: Biography; // Private version
  generatedAt: string;
  memorySnapshotAt: string;
  sharedTimeline: {
    chapters: TimelineChapter[];
    timeSpan: { start: string; end: string };
  };
}

/**
 * Auto-Compilation Service
 * Automatically generate multiple versions from the same source
 */
export class AutoCompilationService {
  /**
   * Auto-compile all versions at once
   */
  async autoCompileVersions(userId: string, spec: BiographySpec): Promise<BiographyVersions> {
    try {
      logger.info({ userId, spec }, 'Starting auto-compilation of versions');

      // Generate base version first
      const baseSpec: BiographySpec = {
        ...spec,
        version: 'main',
        includeIntrospection: true
      };

      const base = await biographyGenerationEngine.generateBiography(userId, baseSpec);
      const memorySnapshotAt = new Date().toISOString();

      // Extract shared timeline from base
      const sharedTimeline = this.extractTimeline(base);

      // Generate other versions in parallel (reusing structure)
      const [safe, explicit, privateVersion] = await Promise.all([
        this.generateVersionFromBase(userId, base, 'safe'),
        this.generateVersionFromBase(userId, base, 'explicit'),
        this.generateVersionFromBase(userId, base, 'private')
      ]);

      // Link all versions to base
      if (safe) {
        await bookVersionManager.linkVersions(base.id, safe.id);
      }
      if (explicit) {
        await bookVersionManager.linkVersions(base.id, explicit.id);
      }
      if (privateVersion) {
        await bookVersionManager.linkVersions(base.id, privateVersion.id);
      }

      logger.info(
        { userId, baseId: base.id, versionsGenerated: [safe?.id, explicit?.id, privateVersion?.id].filter(Boolean).length },
        'Auto-compilation completed'
      );

      return {
        base,
        safe: safe || undefined,
        explicit: explicit || undefined,
        private: privateVersion || undefined,
        generatedAt: new Date().toISOString(),
        memorySnapshotAt,
        sharedTimeline
      };
    } catch (error) {
      logger.error({ error, userId, spec }, 'Failed to auto-compile versions');
      throw error;
    }
  }

  /**
   * Incrementally update all versions when source changes
   */
  async incrementalUpdate(userId: string, baseBiographyId: string): Promise<BiographyVersions> {
    try {
      // Get base biography
      const { data: baseData, error } = await supabaseAdmin
        .from('biographies')
        .select('biography_data, metadata')
        .eq('id', baseBiographyId)
        .eq('user_id', userId)
        .single();

      if (error || !baseData) {
        throw new Error('Base biography not found');
      }

      const base = baseData.biography_data as Biography;
      const spec = base.metadata.spec;

      // Get all existing versions
      const allVersions = await bookVersionManager.getAllVersions(baseBiographyId, userId);

      // Regenerate base if needed
      const newBase = await biographyGenerationEngine.generateBiography(userId, {
        ...spec,
        version: 'main'
      });

      // Regenerate other versions
      const [safe, explicit, privateVersion] = await Promise.all([
        this.generateVersionFromBase(userId, newBase, 'safe'),
        this.generateVersionFromBase(userId, newBase, 'explicit'),
        this.generateVersionFromBase(userId, newBase, 'private')
      ]);

      return {
        base: newBase,
        safe: safe || undefined,
        explicit: explicit || undefined,
        private: privateVersion || undefined,
        generatedAt: new Date().toISOString(),
        memorySnapshotAt: base.metadata.memorySnapshotAt || new Date().toISOString(),
        sharedTimeline: this.extractTimeline(newBase)
      };
    } catch (error) {
      logger.error({ error, userId, baseBiographyId }, 'Failed to incrementally update versions');
      throw error;
    }
  }

  /**
   * Schedule background compilation
   */
  async scheduleAutoCompilation(userId: string, spec: BiographySpec): Promise<void> {
    // Fire and forget - compile in background
    this.autoCompileVersions(userId, spec)
      .then(versions => {
        logger.info({ userId, versionsGenerated: Object.keys(versions).length }, 'Background compilation completed');
      })
      .catch(error => {
        logger.error({ error, userId }, 'Background compilation failed');
      });
  }

  /**
   * Generate a version from base (reusing structure)
   */
  private async generateVersionFromBase(
    userId: string,
    base: Biography,
    versionType: 'safe' | 'explicit' | 'private'
  ): Promise<Biography | null> {
    try {
      const spec: BiographySpec = {
        ...base.metadata.spec,
        version: versionType,
        includeIntrospection: versionType === 'private'
      };

      // Generate new version (will reuse timeline structure)
      const version = await biographyGenerationEngine.generateBiography(userId, spec);

      // Preserve chronology
      const preserved = bookVersionManager.preserveChronology(version);

      return preserved;
    } catch (error) {
      logger.warn({ error, userId, versionType }, 'Failed to generate version from base');
      return null;
    }
  }

  /**
   * Extract timeline from biography
   */
  private extractTimeline(biography: Biography): {
    chapters: TimelineChapter[];
    timeSpan: { start: string; end: string };
  } {
    const chapters = biography.chapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      start_date: ch.timeSpan.start,
      end_date: ch.timeSpan.end,
      description: ch.themes.join(', '),
      summary: ch.text.substring(0, 200),
      parent_id: null,
      user_id: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })) as TimelineChapter[];

    const allDates = [
      ...biography.chapters.map(ch => ch.timeSpan.start),
      ...biography.chapters.map(ch => ch.timeSpan.end)
    ].filter(Boolean).sort();

    return {
      chapters,
      timeSpan: {
        start: allDates[0] || new Date().toISOString(),
        end: allDates[allDates.length - 1] || new Date().toISOString()
      }
    };
  }
}

export const autoCompilationService = new AutoCompilationService();
