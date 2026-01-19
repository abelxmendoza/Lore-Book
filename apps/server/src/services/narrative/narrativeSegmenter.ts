import { parseISO, differenceInDays, format } from 'date-fns';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { NarrativeSegment } from './types';

/**
 * Segments memories into narrative chunks
 */
export class NarrativeSegmenter {
  /**
   * Segment entries into narrative segments
   */
  async segmentEntries(
    userId: string,
    entryIds: string[],
    maxGapDays: number = 7
  ): Promise<NarrativeSegment[]> {
    const segments: NarrativeSegment[] = [];

    try {
      // Get entries
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .in('id', entryIds)
        .order('date', { ascending: true });

      if (error || !entries || entries.length === 0) {
        return segments;
      }

      // Group entries by temporal proximity and themes
      const groups = this.groupEntries(entries, maxGapDays);

      // Create segments from groups
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const segment = await this.createSegment(group, i);
        segments.push(segment);
      }

      logger.debug(
        { userId, segments: segments.length, entries: entries.length },
        'Segmented entries into narrative segments'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to segment entries');
    }

    return segments;
  }

  /**
   * Group entries by temporal proximity and themes
   */
  private groupEntries(entries: any[], maxGapDays: number): any[][] {
    const groups: any[][] = [];
    let currentGroup: any[] = [entries[0]];

    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const current = entries[i];

      const prevDate = parseISO(prev.date);
      const currentDate = parseISO(current.date);
      const daysDiff = differenceInDays(currentDate, prevDate);

      // Check if should start new group
      const shouldBreak =
        daysDiff > maxGapDays ||
        this.hasThemeShift(prev, current) ||
        this.hasCharacterShift(prev, current);

      if (shouldBreak) {
        groups.push(currentGroup);
        currentGroup = [current];
      } else {
        currentGroup.push(current);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Check for theme shift between entries
   */
  private hasThemeShift(entry1: any, entry2: any): boolean {
    const tags1 = new Set(entry1.tags || []);
    const tags2 = new Set(entry2.tags || []);

    // If less than 30% tag overlap, consider it a theme shift
    const intersection = new Set([...tags1].filter(t => tags2.has(t)));
    const union = new Set([...tags1, ...tags2]);
    const overlap = intersection.size / union.size;

    return overlap < 0.3 && tags1.size > 0 && tags2.size > 0;
  }

  /**
   * Check for character shift between entries
   */
  private hasCharacterShift(entry1: any, entry2: any): boolean {
    const people1 = new Set(entry1.people || []);
    const people2 = new Set(entry2.people || []);

    // If completely different people, consider it a shift
    const intersection = new Set([...people1].filter(p => people2.has(p)));
    return intersection.size === 0 && people1.size > 0 && people2.size > 0;
  }

  /**
   * Create a narrative segment from a group of entries
   */
  private async createSegment(
    entries: any[],
    index: number
  ): Promise<NarrativeSegment> {
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    // Extract themes
    const allTags = new Set<string>();
    entries.forEach(e => {
      (e.tags || []).forEach((tag: string) => allTags.add(tag));
    });

    // Extract characters
    const allPeople = new Set<string>();
    entries.forEach(e => {
      (e.people || []).forEach((person: string) => allPeople.add(person));
    });

    // Calculate emotional tone (average sentiment)
    const sentiments = entries
      .map(e => e.sentiment)
      .filter(s => s !== null && s !== undefined) as number[];
    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length
      : 0;

    // Determine emotional tone
    const emotionalTone = this.determineEmotionalTone(avgSentiment);

    // Calculate significance (based on entry count, sentiment variance, etc.)
    const significance = this.calculateSignificance(entries);

    // Generate title
    const title = this.generateTitle(entries, index, Array.from(allTags));

    // Combine content
    const content = entries.map(e => e.content).join('\n\n');

    return {
      id: `segment_${index}_${firstEntry.id}`,
      entry_ids: entries.map(e => e.id),
      title,
      content,
      start_date: firstEntry.date,
      end_date: lastEntry.date,
      theme: Array.from(allTags).slice(0, 3).join(', ') || undefined,
      characters: Array.from(allPeople),
      emotional_tone: emotionalTone,
      significance,
      metadata: {
        entry_count: entries.length,
        duration_days: differenceInDays(parseISO(lastEntry.date), parseISO(firstEntry.date)),
        average_sentiment: avgSentiment,
        tags: Array.from(allTags),
      },
    };
  }

  /**
   * Determine emotional tone from sentiment
   */
  private determineEmotionalTone(sentiment: number): string {
    if (sentiment > 0.3) return 'positive';
    if (sentiment < -0.3) return 'negative';
    if (sentiment > 0.1) return 'slightly_positive';
    if (sentiment < -0.1) return 'slightly_negative';
    return 'neutral';
  }

  /**
   * Calculate significance of segment
   */
  private calculateSignificance(entries: any[]): number {
    let score = 0;

    // More entries = more significant
    score += Math.min(entries.length / 10, 0.3);

    // Sentiment variance = more significant (emotional moments)
    const sentiments = entries
      .map(e => e.sentiment)
      .filter(s => s !== null && s !== undefined) as number[];
    if (sentiments.length > 1) {
      const avg = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
      const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / sentiments.length;
      score += Math.min(variance, 0.3);
    }

    // Has people = more significant
    const hasPeople = entries.some(e => (e.people || []).length > 0);
    if (hasPeople) score += 0.2;

    // Has tags = more significant
    const hasTags = entries.some(e => (e.tags || []).length > 0);
    if (hasTags) score += 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Generate title for segment
   */
  private generateTitle(entries: any[], index: number, tags: string[]): string {
    if (tags.length > 0) {
      return `${tags[0]}${tags.length > 1 ? ` and ${tags.length - 1} more` : ''}`;
    }

    const firstDate = parseISO(entries[0].date);
    const lastDate = parseISO(entries[entries.length - 1].date);
    const daysDiff = differenceInDays(lastDate, firstDate);

    if (daysDiff === 0) {
      return `Day ${index + 1}: ${format(firstDate, 'MMM d, yyyy')}`;
    }

    return `Period ${index + 1}: ${format(firstDate, 'MMM d')} - ${format(lastDate, 'MMM d, yyyy')}`;
  }
}

