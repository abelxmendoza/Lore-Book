import { parseISO, format } from 'date-fns';

import { logger } from '../../logger';

import { NarrativeConnector } from './narrativeConnector';
import { NarrativeSegmenter } from './narrativeSegmenter';
import type { Narrative, NarrativeType, NarrativeStyle, NarrativeQuery } from './types';

/**
 * Builds coherent narratives from memories
 */
export class NarrativeBuilder {
  private segmenter: NarrativeSegmenter;
  private connector: NarrativeConnector;

  constructor() {
    this.segmenter = new NarrativeSegmenter();
    this.connector = new NarrativeConnector();
  }

  /**
   * Build narrative from entries
   */
  async buildNarrative(
    userId: string,
    entryIds: string[],
    type: NarrativeType = 'chronological',
    style: NarrativeStyle = 'reflective'
  ): Promise<Narrative | null> {
    try {
      logger.debug({ userId, entryIds: entryIds.length, type, style }, 'Building narrative');

      // Segment entries
      const segments = await this.segmenter.segmentEntries(userId, entryIds);

      if (segments.length === 0) {
        return null;
      }

      // Generate transitions
      const transitions = this.connector.generateTransitions(segments);

      // Extract themes and characters
      const themes = this.extractThemes(segments);
      const characters = this.extractCharacters(segments);

      // Determine emotional arc
      const emotionalArc = this.determineEmotionalArc(segments);

      // Generate title and summary
      const title = this.generateTitle(segments, type);
      const summary = this.generateSummary(segments, transitions, type);

      // Determine dates
      const startDate = segments[0].start_date;
      const endDate = segments[segments.length - 1].end_date;

      const narrative: Narrative = {
        user_id: userId,
        type,
        style,
        title,
        summary,
        segments,
        transitions,
        entry_ids: entryIds,
        start_date: startDate,
        end_date: endDate,
        themes,
        characters,
        emotional_arc: emotionalArc,
        status: 'draft',
        metadata: {
          segment_count: segments.length,
          transition_count: transitions.length,
          duration_days: this.calculateDuration(startDate, endDate),
        },
      };

      logger.info({ userId, narrativeId: narrative.id }, 'Built narrative');

      return narrative;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build narrative');
      return null;
    }
  }

  /**
   * Extract themes from segments
   */
  private extractThemes(segments: NarrativeSegment[]): string[] {
    const themeCounts = new Map<string, number>();

    segments.forEach(segment => {
      if (segment.theme) {
        const themes = segment.theme.split(',').map(t => t.trim());
        themes.forEach(theme => {
          themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
        });
      }
    });

    return Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }

  /**
   * Extract characters from segments
   */
  private extractCharacters(segments: NarrativeSegment[]): string[] {
    const charCounts = new Map<string, number>();

    segments.forEach(segment => {
      (segment.characters || []).forEach(char => {
        charCounts.set(char, (charCounts.get(char) || 0) + 1);
      });
    });

    return Array.from(charCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([char]) => char);
  }

  /**
   * Determine emotional arc
   */
  private determineEmotionalArc(segments: NarrativeSegment[]): {
    start: string;
    end: string;
    trajectory: 'rising' | 'falling' | 'stable' | 'cyclical';
  } | undefined {
    if (segments.length < 2) return undefined;

    const tones = segments.map(s => s.emotional_tone || 'neutral');
    const start = tones[0];
    const end = tones[tones.length - 1];

    // Determine trajectory
    const toneOrder = ['negative', 'slightly_negative', 'neutral', 'slightly_positive', 'positive'];
    const startIndex = toneOrder.indexOf(start);
    const endIndex = toneOrder.indexOf(end);

    let trajectory: 'rising' | 'falling' | 'stable' | 'cyclical';
    if (endIndex > startIndex) {
      trajectory = 'rising';
    } else if (endIndex < startIndex) {
      trajectory = 'falling';
    } else {
      // Check for cyclical pattern
      const hasVariation = new Set(tones).size > 2;
      trajectory = hasVariation ? 'cyclical' : 'stable';
    }

    return {
      start,
      end,
      trajectory,
    };
  }

  /**
   * Generate title
   */
  private generateTitle(segments: NarrativeSegment[], type: NarrativeType): string {
    const firstDate = parseISO(segments[0].start_date);
    const lastDate = parseISO(segments[segments.length - 1].end_date);

    switch (type) {
      case 'chronological':
        return `From ${format(firstDate, 'MMMM yyyy')} to ${format(lastDate, 'MMMM yyyy')}`;
      case 'thematic':
        const themes = this.extractThemes(segments);
        return themes.length > 0 ? `A Story of ${themes[0]}` : 'A Thematic Journey';
      case 'character_focused':
        const chars = this.extractCharacters(segments);
        return chars.length > 0 ? `Stories with ${chars[0]}` : 'Character Stories';
      case 'emotional_arc':
        const arc = this.determineEmotionalArc(segments);
        if (arc) {
          return `An Emotional Journey: ${arc.start} to ${arc.end}`;
        }
        return 'An Emotional Story';
      default:
        return `A Story from ${format(firstDate, 'MMM d')} to ${format(lastDate, 'MMM d, yyyy')}`;
    }
  }

  /**
   * Generate summary
   */
  private generateSummary(
    segments: NarrativeSegment[],
    transitions: any[],
    type: NarrativeType
  ): string {
    const segmentCount = segments.length;
    const duration = this.calculateDuration(segments[0].start_date, segments[segments.length - 1].end_date);

    let summary = `This narrative spans ${duration} days and ${segmentCount} distinct segments. `;

    if (type === 'emotional_arc') {
      const arc = this.determineEmotionalArc(segments);
      if (arc) {
        summary += `The emotional journey moves from ${arc.start} to ${arc.end}, following a ${arc.trajectory} trajectory. `;
      }
    }

    const themes = this.extractThemes(segments);
    if (themes.length > 0) {
      summary += `Key themes include ${themes.slice(0, 3).join(', ')}. `;
    }

    const characters = this.extractCharacters(segments);
    if (characters.length > 0) {
      summary += `Notable characters include ${characters.slice(0, 3).join(', ')}.`;
    }

    return summary.trim();
  }

  /**
   * Calculate duration in days
   */
  private calculateDuration(startDate: string, endDate: string): number {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }
}

