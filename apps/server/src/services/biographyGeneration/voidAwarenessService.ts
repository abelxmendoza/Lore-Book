/**
 * Void Awareness Service
 * 
 * Detects gaps in the timeline, creates void chapters for significant periods
 * of missing content, and analyzes context around voids.
 */

import { logger } from '../../logger';
import type {
  NarrativeAtom,
  ChapterCluster,
  VoidPeriod,
  VoidContext,
  BiographySpec
} from './types';
import { themeAnalyzer } from './themeAnalyzer';

const MIN_GAP_DAYS = 3; // Minimum gap to consider (same as GapDetector)
const SHORT_GAP_DAYS = 30;
const MEDIUM_GAP_DAYS = 180;

export class VoidAwarenessService {
  /**
   * Detect all voids in the timeline
   */
  detectVoids(
    atoms: NarrativeAtom[],
    timelineSpan?: { start: string; end: string }
  ): VoidPeriod[] {
    if (atoms.length === 0) {
      // If no atoms, the entire timeline span is a void
      if (timelineSpan) {
        const durationDays = Math.ceil(
          (new Date(timelineSpan.end).getTime() - new Date(timelineSpan.start).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        return [{
          id: 'void-complete',
          start: timelineSpan.start,
          end: timelineSpan.end,
          durationDays,
          type: 'void',
          significance: 'high',
          fillStrategy: 'prompt_user'
        }];
      }
      return [];
    }

    const voids: VoidPeriod[] = [];
    
    // Sort atoms by timestamp
    const sortedAtoms = [...atoms].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Detect gaps between consecutive atoms
    for (let i = 0; i < sortedAtoms.length - 1; i++) {
      const currentAtom = sortedAtoms[i];
      const nextAtom = sortedAtoms[i + 1];
      
      const currentDate = new Date(currentAtom.timestamp);
      const nextDate = new Date(nextAtom.timestamp);
      const diffDays = Math.ceil(
        (nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays > MIN_GAP_DAYS) {
        const voidPeriod: VoidPeriod = {
          id: `void-${i}-${i + 1}`,
          start: currentAtom.timestamp,
          end: nextAtom.timestamp,
          durationDays: diffDays,
          type: this.categorizeVoidType(diffDays),
          significance: this.calculateSignificance(diffDays, i, sortedAtoms.length),
          fillStrategy: this.determineFillStrategy(diffDays)
        };
        voids.push(voidPeriod);
      }
    }

    // Detect gaps at timeline boundaries
    if (timelineSpan) {
      const firstAtom = sortedAtoms[0];
      const lastAtom = sortedAtoms[sortedAtoms.length - 1];
      
      const timelineStart = new Date(timelineSpan.start);
      const timelineEnd = new Date(timelineSpan.end);
      const firstAtomDate = new Date(firstAtom.timestamp);
      const lastAtomDate = new Date(lastAtom.timestamp);

      // Gap before first atom
      if (firstAtomDate.getTime() > timelineStart.getTime()) {
        const gapDays = Math.ceil(
          (firstAtomDate.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (gapDays > MIN_GAP_DAYS) {
          voids.push({
            id: 'void-before-start',
            start: timelineSpan.start,
            end: firstAtom.timestamp,
            durationDays: gapDays,
            type: this.categorizeVoidType(gapDays),
            significance: this.calculateSignificance(gapDays, 0, sortedAtoms.length),
            fillStrategy: this.determineFillStrategy(gapDays)
          });
        }
      }

      // Gap after last atom
      if (lastAtomDate.getTime() < timelineEnd.getTime()) {
        const gapDays = Math.ceil(
          (timelineEnd.getTime() - lastAtomDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (gapDays > MIN_GAP_DAYS) {
          voids.push({
            id: 'void-after-end',
            start: lastAtom.timestamp,
            end: timelineSpan.end,
            durationDays: gapDays,
            type: this.categorizeVoidType(gapDays),
            significance: this.calculateSignificance(gapDays, sortedAtoms.length - 1, sortedAtoms.length),
            fillStrategy: this.determineFillStrategy(gapDays)
          });
        }
      }
    }

    // Analyze context for each void
    return voids.map(v => this.analyzeVoidContext(v, atoms));
  }

  /**
   * Categorize void type based on duration
   */
  private categorizeVoidType(durationDays: number): VoidPeriod['type'] {
    if (durationDays < SHORT_GAP_DAYS) {
      return 'short_gap';
    } else if (durationDays < MEDIUM_GAP_DAYS) {
      return 'medium_gap';
    } else {
      return 'long_silence';
    }
  }

  /**
   * Calculate void significance
   */
  private calculateSignificance(
    durationDays: number,
    position: number,
    totalAtoms: number
  ): VoidPeriod['significance'] {
    // Base significance on duration
    let significance: VoidPeriod['significance'] = 'low';
    
    if (durationDays >= MEDIUM_GAP_DAYS) {
      significance = 'high';
    } else if (durationDays >= SHORT_GAP_DAYS) {
      significance = 'medium';
    }

    // Increase significance if void is in early life (first 20% of timeline)
    const positionRatio = position / totalAtoms;
    if (positionRatio < 0.2 && durationDays >= SHORT_GAP_DAYS) {
      if (significance === 'low') significance = 'medium';
      if (significance === 'medium') significance = 'high';
    }

    return significance;
  }

  /**
   * Determine fill strategy based on void type
   */
  private determineFillStrategy(durationDays: number): VoidPeriod['fillStrategy'] {
    if (durationDays >= MEDIUM_GAP_DAYS) {
      return 'prompt_user';
    } else if (durationDays >= SHORT_GAP_DAYS) {
      return 'infer_context';
    } else {
      return 'acknowledge_void';
    }
  }

  /**
   * Analyze context around a void period
   */
  analyzeVoidContext(voidPeriod: VoidPeriod, atoms: NarrativeAtom[]): VoidPeriod {
    const voidStart = new Date(voidPeriod.start);
    const voidEnd = new Date(voidPeriod.end);

    // Find atoms before void (last 3-5 atoms)
    const beforeAtoms = atoms
      .filter(a => new Date(a.timestamp).getTime() < voidStart.getTime())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    // Find atoms after void (first 3-5 atoms)
    const afterAtoms = atoms
      .filter(a => new Date(a.timestamp).getTime() > voidEnd.getTime())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, 5);

    // Extract themes from surrounding periods
    const surroundingAtoms = [...beforeAtoms, ...afterAtoms];
    const inferredThemes = themeAnalyzer.extractDominantThemes(surroundingAtoms, {
      maxThemes: 5,
      minFrequency: 1
    });

    // Estimate activity based on context
    const estimatedActivity = this.estimateActivity(beforeAtoms, afterAtoms, inferredThemes);

    // Build context descriptions
    const beforePeriod = beforeAtoms.length > 0
      ? this.summarizePeriod(beforeAtoms, 'before')
      : undefined;
    
    const afterPeriod = afterAtoms.length > 0
      ? this.summarizePeriod(afterAtoms, 'after')
      : undefined;

    return {
      ...voidPeriod,
      context: {
        beforePeriod,
        afterPeriod,
        estimatedActivity,
        surroundingThemes: inferredThemes
      }
    };
  }

  /**
   * Estimate what might have happened during void
   */
  private estimateActivity(
    beforeAtoms: NarrativeAtom[],
    afterAtoms: NarrativeAtom[],
    themes: string[]
  ): string {
    if (beforeAtoms.length === 0 && afterAtoms.length === 0) {
      return 'Unknown period with no surrounding context';
    }

    const beforeThemes = themeAnalyzer.extractDominantThemes(beforeAtoms, { maxThemes: 3 });
    const afterThemes = themeAnalyzer.extractDominantThemes(afterAtoms, { maxThemes: 3 });

    const commonThemes = beforeThemes.filter(t => afterThemes.includes(t));
    
    if (commonThemes.length > 0) {
      return `Likely continuation of ${commonThemes.join(', ')} themes`;
    }

    if (afterThemes.length > 0 && beforeThemes.length > 0) {
      return `Transition from ${beforeThemes[0]} to ${afterThemes[0]}`;
    }

    if (themes.length > 0) {
      return `Period related to ${themes.slice(0, 2).join(' and ')}`;
    }

    return 'Period of unknown activity';
  }

  /**
   * Summarize a period (before or after void)
   */
  private summarizePeriod(atoms: NarrativeAtom[], direction: 'before' | 'after'): string {
    if (atoms.length === 0) return '';

    const themes = themeAnalyzer.extractDominantThemes(atoms, { maxThemes: 3 });
    const timeRange = atoms.length > 0
      ? `${new Date(atoms[0].timestamp).toLocaleDateString()} to ${new Date(atoms[atoms.length - 1].timestamp).toLocaleDateString()}`
      : '';

    return `The period ${direction} this gap (${timeRange}) was characterized by ${themes.join(', ')}`;
  }

  /**
   * Create void chapters for significant voids
   */
  createVoidChapters(
    voids: VoidPeriod[],
    spec: BiographySpec
  ): Array<ChapterCluster & { isVoidChapter: boolean; voidPeriodId: string }> {
    // Only create chapters for medium/high significance voids
    const significantVoids = voids.filter(v => v.significance !== 'low');
    
    return significantVoids.map(v => {
      // Generate title based on void type and duration
      const title = this.generateVoidChapterTitle(v);
      
      // Create minimal placeholder atoms for void chapter
      // (empty array would work, but having a placeholder helps with structure)
      const placeholderAtoms: NarrativeAtom[] = [];

      return {
        id: `void-chapter-${v.id}`,
        title,
        atoms: placeholderAtoms,
        dominantThemes: v.context?.surroundingThemes || [],
        timeSpan: {
          start: v.start,
          end: v.end
        },
        significance: v.significance === 'high' ? 0.5 : 0.3,
        isVoidChapter: true,
        voidPeriodId: v.id
      } as ChapterCluster & { isVoidChapter: boolean; voidPeriodId: string };
    });
  }

  /**
   * Generate title for void chapter
   */
  private generateVoidChapterTitle(voidPeriod: VoidPeriod): string {
    const startDate = new Date(voidPeriod.start);
    const endDate = new Date(voidPeriod.end);
    
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    const months = Math.ceil(voidPeriod.durationDays / 30);
    const years = Math.floor(voidPeriod.durationDays / 365);

    switch (voidPeriod.type) {
      case 'short_gap':
        return `The Missing Weeks: ${startMonth}`;
      case 'medium_gap':
        if (months < 12) {
          return `The Missing Months: ${startMonth} - ${endMonth}`;
        } else {
          return `The Missing Year: ${startDate.getFullYear()}`;
        }
      case 'long_silence':
        if (years > 0) {
          return `The Silent Years: ${startDate.getFullYear()} - ${endDate.getFullYear()}`;
        } else {
          return `The Silent Period: ${startMonth} - ${endMonth}`;
        }
      case 'void':
        return `Unknown Period: ${startMonth} - ${endMonth}`;
      default:
        return `Gap in Timeline: ${startMonth} - ${endMonth}`;
    }
  }

  /**
   * Generate prompts for filling void
   */
  generateVoidPrompts(voidPeriod: VoidPeriod): string[] {
    const prompts: string[] = [];

    if (voidPeriod.type === 'long_silence' || voidPeriod.type === 'void') {
      prompts.push('What major life changes occurred during this period?');
      prompts.push('Were there significant events or milestones you experienced?');
      prompts.push('Did any important relationships begin, develop, or end?');
      prompts.push('What challenges or growth did you face?');
      prompts.push('Were there any creative projects, work changes, or personal transformations?');
    } else if (voidPeriod.type === 'medium_gap') {
      prompts.push('What happened during these months?');
      prompts.push('Were there any notable events or experiences?');
      prompts.push('Did any relationships or projects develop?');
    } else {
      prompts.push('What occurred during this period?');
    }

    // Add context-specific prompts
    if (voidPeriod.context?.surroundingThemes && voidPeriod.context.surroundingThemes.length > 0) {
      prompts.push(`How did this period relate to ${voidPeriod.context.surroundingThemes[0]}?`);
    }

    return prompts;
  }
}

export const voidAwarenessService = new VoidAwarenessService();
