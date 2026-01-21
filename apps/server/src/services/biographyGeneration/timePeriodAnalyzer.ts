/**
 * Time Period Analyzer
 * 
 * Detects natural time periods and groups chapters accordingly.
 */

import { logger } from '../../logger';
import type { ChapterCluster, TimePeriod, VoidPeriod } from './types';

export class TimePeriodAnalyzer {
  /**
   * Detect natural time periods from chapters
   */
  detectTimePeriods(
    chapters: Array<ChapterCluster & { title: string; isVoidChapter?: boolean }>,
    timelineHierarchy?: { sagas?: Array<{ id: string; title: string; start_date: string; end_date?: string | null }> },
    voidPeriods?: VoidPeriod[]
  ): TimePeriod[] {
    if (chapters.length === 0) {
      return [];
    }

    const periods: TimePeriod[] = [];

    // Strategy 1: Use timeline hierarchy (Sagas) as period boundaries
    if (timelineHierarchy?.sagas && timelineHierarchy.sagas.length > 0) {
      for (const saga of timelineHierarchy.sagas) {
        const sagaStart = new Date(saga.start_date);
        const sagaEnd = saga.end_date ? new Date(saga.end_date) : new Date();

        // Find chapters that fall within this saga
        const sagaChapters = chapters.filter(ch => {
          const chStart = new Date(ch.timeSpan.start);
          const chEnd = new Date(ch.timeSpan.end);
          return (chStart >= sagaStart && chStart <= sagaEnd) ||
                 (chEnd >= sagaStart && chEnd <= sagaEnd) ||
                 (chStart <= sagaStart && chEnd >= sagaEnd);
        });

        if (sagaChapters.length > 0) {
          // Extract themes from chapters
          const allThemes = new Set<string>();
          sagaChapters.forEach(ch => {
            ch.dominantThemes.forEach(theme => allThemes.add(theme));
          });

          // Count void chapters in this period
          const voidChaptersInPeriod = sagaChapters.filter(ch => ch.isVoidChapter).length;
          const voidCount = voidChaptersInPeriod;
          
          let summary = `Period covering ${saga.title}`;
          if (voidCount > 0 && voidPeriods) {
            const periodVoids = voidPeriods.filter(v => {
              const voidStart = new Date(v.start);
              const voidEnd = new Date(v.end);
              return (voidStart >= sagaStart && voidStart <= sagaEnd) ||
                     (voidEnd >= sagaStart && voidEnd <= sagaEnd) ||
                     (voidStart <= sagaStart && voidEnd >= sagaEnd);
            });
            if (periodVoids.length > 0) {
              summary += `. Contains ${voidCount} void chapter${voidCount > 1 ? 's' : ''} (${periodVoids.length} gap${periodVoids.length > 1 ? 's' : ''} in timeline)`;
            }
          }

          periods.push({
            id: `period-${saga.id}`,
            title: saga.title,
            start: saga.start_date,
            end: saga.end_date || new Date().toISOString(),
            chapters: sagaChapters.map(ch => ch.id),
            themes: Array.from(allThemes),
            summary
          });
        }
      }
    }

    // Strategy 2: Detect gaps in timeline (significant time jumps)
    if (periods.length === 0) {
      const sortedChapters = [...chapters].sort((a, b) => 
        new Date(a.timeSpan.start).getTime() - new Date(b.timeSpan.start).getTime()
      );

      let currentPeriod: {
        start: string;
        end: string;
        chapters: Array<ChapterCluster & { title: string }>;
        themes: Set<string>;
      } | null = null;

      for (let i = 0; i < sortedChapters.length; i++) {
        const chapter = sortedChapters[i];
        const chapterStart = new Date(chapter.timeSpan.start);

        if (!currentPeriod) {
          // Start new period
          currentPeriod = {
            start: chapter.timeSpan.start,
            end: chapter.timeSpan.end,
            chapters: [chapter],
            themes: new Set(chapter.dominantThemes)
          };
        } else {
          const lastChapterEnd = new Date(currentPeriod.end);
          const timeGap = chapterStart.getTime() - lastChapterEnd.getTime();
          const daysGap = timeGap / (1000 * 60 * 60 * 24);

          // If gap is more than 90 days, start a new period
          if (daysGap > 90) {
            // Save current period
            periods.push({
              id: `period-${periods.length + 1}`,
              title: this.generatePeriodTitle(currentPeriod.chapters),
              start: currentPeriod.start,
              end: currentPeriod.end,
              chapters: currentPeriod.chapters.map(ch => ch.id),
              themes: Array.from(currentPeriod.themes),
              summary: this.generatePeriodSummary(currentPeriod.chapters)
            });

            // Start new period
            currentPeriod = {
              start: chapter.timeSpan.start,
              end: chapter.timeSpan.end,
              chapters: [chapter],
              themes: new Set(chapter.dominantThemes)
            };
          } else {
            // Add to current period
            currentPeriod.chapters.push(chapter);
            currentPeriod.end = chapter.timeSpan.end;
            chapter.dominantThemes.forEach(theme => currentPeriod!.themes.add(theme));
          }
        }
      }

      // Save last period
      if (currentPeriod) {
        periods.push({
          id: `period-${periods.length + 1}`,
          title: this.generatePeriodTitle(currentPeriod.chapters),
          start: currentPeriod.start,
          end: currentPeriod.end,
          chapters: currentPeriod.chapters.map(ch => ch.id),
          themes: Array.from(currentPeriod.themes),
          summary: this.generatePeriodSummary(currentPeriod.chapters)
        });
      }
    }

    return periods;
  }

  /**
   * Generate period title from chapters
   */
  private generatePeriodTitle(chapters: Array<ChapterCluster & { title: string }>): string {
    if (chapters.length === 0) return 'Unknown Period';
    if (chapters.length === 1) return chapters[0].title;

    const startYear = new Date(chapters[0].timeSpan.start).getFullYear();
    const endYear = new Date(chapters[chapters.length - 1].timeSpan.end).getFullYear();

    if (startYear === endYear) {
      return `${startYear}`;
    }
    return `${startYear} - ${endYear}`;
  }

  /**
   * Generate period summary from chapters
   */
  private generatePeriodSummary(chapters: Array<ChapterCluster & { title: string; isVoidChapter?: boolean }>): string {
    if (chapters.length === 0) return '';
    
    const themes = new Set<string>();
    chapters.forEach(ch => {
      ch.dominantThemes.forEach(theme => themes.add(theme));
    });

    const voidCount = chapters.filter(ch => ch.isVoidChapter).length;
    const themeList = Array.from(themes).slice(0, 3).join(', ');
    
    let summary = `A period of ${chapters.length} chapter${chapters.length > 1 ? 's' : ''} focusing on ${themeList || 'various themes'}`;
    if (voidCount > 0) {
      summary += `. Includes ${voidCount} void chapter${voidCount > 1 ? 's' : ''} (periods with missing content)`;
    }
    summary += '.';
    
    return summary;
  }

  /**
   * Group chapters by period
   */
  groupChaptersByPeriod(
    chapters: Array<ChapterCluster & { title: string }>,
    periods: TimePeriod[]
  ): Map<string, Array<ChapterCluster & { title: string }>> {
    const grouped = new Map<string, Array<ChapterCluster & { title: string }>>();

    for (const period of periods) {
      const periodChapters = chapters.filter(ch => period.chapters.includes(ch.id));
      if (periodChapters.length > 0) {
        grouped.set(period.id, periodChapters);
      }
    }

    // Add unassigned chapters
    const assignedChapterIds = new Set(periods.flatMap(p => p.chapters));
    const unassigned = chapters.filter(ch => !assignedChapterIds.has(ch.id));
    if (unassigned.length > 0) {
      grouped.set('unassigned', unassigned);
    }

    return grouped;
  }
}

export const timePeriodAnalyzer = new TimePeriodAnalyzer();
