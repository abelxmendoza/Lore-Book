/**
 * Theme Analyzer
 * 
 * Extracts dominant themes and organizes chapters by themes.
 */

import { logger } from '../../logger';
import type { NarrativeAtom, ChapterCluster, Domain } from './types';

export class ThemeAnalyzer {
  /**
   * Extract dominant themes from atoms
   */
  extractDominantThemes(
    atoms: NarrativeAtom[],
    options: {
      minFrequency?: number;
      maxThemes?: number;
      weightBySignificance?: boolean;
    } = {}
  ): string[] {
    const { minFrequency = 1, maxThemes = 10, weightBySignificance = true } = options;

    const themeScores: Record<string, number> = {};

    atoms.forEach(atom => {
      // Add domains as themes
      atom.domains.forEach(domain => {
        const score = weightBySignificance ? atom.significance : 1;
        themeScores[domain] = (themeScores[domain] || 0) + score;
      });

      // Add tags as themes
      if (atom.tags) {
        atom.tags.forEach(tag => {
          const score = weightBySignificance ? atom.significance : 1;
          themeScores[tag] = (themeScores[tag] || 0) + score;
        });
      }
    });

    // Filter by minimum frequency and sort by score
    return Object.entries(themeScores)
      .filter(([_, score]) => score >= minFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxThemes)
      .map(([theme]) => theme);
  }

  /**
   * Identify cross-cutting themes (themes that span multiple chapters)
   */
  identifyCrossCuttingThemes(
    chapters: Array<ChapterCluster & { title: string }>,
    minChapters: number = 2
  ): string[] {
    const themeChapterCount: Record<string, number> = {};

    chapters.forEach(chapter => {
      const chapterThemes = new Set<string>();
      chapter.dominantThemes.forEach(theme => chapterThemes.add(theme));
      chapterThemes.forEach(theme => {
        themeChapterCount[theme] = (themeChapterCount[theme] || 0) + 1;
      });
    });

    return Object.entries(themeChapterCount)
      .filter(([_, count]) => count >= minChapters)
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme);
  }

  /**
   * Create thematic chapter clusters
   */
  createThematicClusters(
    atoms: NarrativeAtom[],
    dominantThemes: string[]
  ): Map<string, NarrativeAtom[]> {
    const clusters = new Map<string, NarrativeAtom[]>();

    dominantThemes.forEach(theme => {
      const themeAtoms = atoms.filter(atom => {
        // Check if atom belongs to this theme
        return atom.domains.includes(theme as Domain) ||
               atom.tags?.includes(theme) ||
               atom.content.toLowerCase().includes(theme.toLowerCase());
      });

      if (themeAtoms.length > 0) {
        clusters.set(theme, themeAtoms);
      }
    });

    return clusters;
  }

  /**
   * Detect theme evolution over time
   */
  detectThemeEvolution(
    atoms: NarrativeAtom[],
    theme: string,
    timeWindows: number = 4
  ): Array<{ period: string; strength: number; atoms: NarrativeAtom[] }> {
    if (atoms.length === 0) return [];

    // Sort atoms by time
    const sortedAtoms = [...atoms].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const startTime = new Date(sortedAtoms[0].timestamp).getTime();
    const endTime = new Date(sortedAtoms[sortedAtoms.length - 1].timestamp).getTime();
    const windowSize = (endTime - startTime) / timeWindows;

    const evolution: Array<{ period: string; strength: number; atoms: NarrativeAtom[] }> = [];

    for (let i = 0; i < timeWindows; i++) {
      const windowStart = startTime + (i * windowSize);
      const windowEnd = startTime + ((i + 1) * windowSize);

      const windowAtoms = sortedAtoms.filter(atom => {
        const atomTime = new Date(atom.timestamp).getTime();
        return atomTime >= windowStart && atomTime < windowEnd;
      });

      // Calculate theme strength in this window
      const themeAtoms = windowAtoms.filter(atom => {
        return atom.domains.includes(theme as Domain) ||
               atom.tags?.includes(theme) ||
               atom.content.toLowerCase().includes(theme.toLowerCase());
      });

      const strength = themeAtoms.length > 0
        ? themeAtoms.reduce((sum, atom) => sum + atom.significance, 0) / themeAtoms.length
        : 0;

      const periodStart = new Date(windowStart).getFullYear();
      const periodEnd = new Date(windowEnd).getFullYear();
      const periodLabel = periodStart === periodEnd 
        ? `${periodStart}` 
        : `${periodStart}-${periodEnd}`;

      evolution.push({
        period: periodLabel,
        strength,
        atoms: themeAtoms
      });
    }

    return evolution;
  }

  /**
   * Organize chapters by primary theme
   */
  organizeChaptersByTheme(
    chapters: Array<ChapterCluster & { title: string }>
  ): Map<string, Array<ChapterCluster & { title: string }>> {
    const organized = new Map<string, Array<ChapterCluster & { title: string }>>();

    chapters.forEach(chapter => {
      // Use the first dominant theme as primary
      const primaryTheme = chapter.dominantThemes[0] || 'uncategorized';
      
      if (!organized.has(primaryTheme)) {
        organized.set(primaryTheme, []);
      }
      organized.get(primaryTheme)!.push(chapter);
    });

    return organized;
  }
}

export const themeAnalyzer = new ThemeAnalyzer();
