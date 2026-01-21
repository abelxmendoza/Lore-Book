import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';
import { buildAtomsFromTimeline } from './narrativeAtomBuilder';
import type { Domain } from './types';

export interface TimelineSpan {
  start: string; // ISO date
  end: string; // ISO date
  days: number;
  months: number;
  years: number;
}

export interface DomainCoverage {
  domain: Domain;
  atomCount: number;
  entryCount: number;
}

export interface EntityCounts {
  characters: number;
  locations: number;
  events: number;
  skills: number;
}

export interface ContentDensity {
  entriesPerMonth: number;
  entriesPerYear: number;
  averageWordsPerEntry: number;
}

export interface MostActivePeriod {
  month: string;
  year: number;
  entryCount: number;
}

export interface ContentStats {
  totalJournalEntries: number;
  totalChatMessages: number;
  totalNarrativeAtoms: number;
  totalWordCount: number;
  totalCharacterCount: number;
  timelineSpan: TimelineSpan;
  domainCoverage: DomainCoverage[];
  entityCounts: EntityCounts;
  contentDensity: ContentDensity;
  mostActivePeriods: MostActivePeriod[];
}

/**
 * Content Availability Tracking Service
 * Tracks all content available for biography generation
 */
export class ContentAvailabilityService {
  /**
   * Get comprehensive content statistics
   */
  async getContentStats(userId: string): Promise<ContentStats> {
    try {
      // Get all counts in parallel
      const [
        journalEntries,
        chatMessages,
        narrativeAtoms,
        wordCount,
        characterCount,
        entityCounts,
        entries
      ] = await Promise.all([
        this.getJournalEntryCount(userId),
        this.getChatMessageCount(userId),
        this.getNarrativeAtomCount(userId),
        this.calculateWordCount(userId),
        this.getCharacterCount(userId),
        this.getEntityCounts(userId),
        this.getJournalEntries(userId)
      ]);

      // Calculate timeline span
      const timelineSpan = await this.getTimelineSpan(userId, entries);

      // Get domain coverage
      const domainCoverage = await this.getDomainCoverage(userId, narrativeAtoms);

      // Calculate content density
      const contentDensity = this.calculateContentDensity(entries, timelineSpan);

      // Get most active periods
      const mostActivePeriods = this.getMostActivePeriods(entries);

      return {
        totalJournalEntries: journalEntries,
        totalChatMessages: chatMessages,
        totalNarrativeAtoms: narrativeAtoms,
        totalWordCount: wordCount,
        totalCharacterCount: characterCount,
        timelineSpan,
        domainCoverage,
        entityCounts,
        contentDensity,
        mostActivePeriods
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get content stats');
      throw error;
    }
  }

  /**
   * Get journal entry count
   */
  private async getJournalEntryCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get journal entry count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get chat message count
   */
  private async getChatMessageCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'user');

    if (error) {
      logger.warn({ error, userId }, 'Failed to get chat message count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get narrative atom count
   */
  private async getNarrativeAtomCount(userId: string): Promise<number> {
    try {
      const atoms = await buildAtomsFromTimeline(userId);
      return atoms.length;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get narrative atom count');
      return 0;
    }
  }

  /**
   * Calculate total word count
   */
  async calculateWordCount(userId: string): Promise<number> {
    try {
      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('content, summary')
        .eq('user_id', userId);

      if (error) {
        logger.warn({ error, userId }, 'Failed to get entries for word count');
        return 0;
      }

      let totalWords = 0;
      (entries || []).forEach(entry => {
        const text = entry.content || entry.summary || '';
        const words = text.split(/\s+/).filter(w => w.length > 0);
        totalWords += words.length;
      });

      return totalWords;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to calculate word count');
      return 0;
    }
  }

  /**
   * Get character count
   */
  private async getCharacterCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('characters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get character count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get entity counts
   */
  async getEntityCounts(userId: string): Promise<EntityCounts> {
    const [characters, locations, events, skills] = await Promise.all([
      this.getCharacterCount(userId),
      this.getLocationCount(userId),
      this.getEventCount(userId),
      this.getSkillCount(userId)
    ]);

    return {
      characters,
      locations,
      events,
      skills
    };
  }

  /**
   * Get location count
   */
  private async getLocationCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get location count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get event count
   */
  private async getEventCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get event count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get skill count
   */
  private async getSkillCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('skills')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      logger.warn({ error, userId }, 'Failed to get skill count');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get timeline span
   */
  async getTimelineSpan(userId: string, entries?: any[]): Promise<TimelineSpan> {
    try {
      if (!entries) {
        entries = await this.getJournalEntries(userId);
      }

      if (entries.length === 0) {
        return {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          days: 0,
          months: 0,
          years: 0
        };
      }

      // Get dates from entries
      const dates = entries
        .map(e => {
          const dateStr = e.date || e.created_at || e.timestamp;
          return dateStr ? new Date(dateStr) : null;
        })
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length === 0) {
        return {
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          days: 0,
          months: 0,
          years: 0
        };
      }

      const start = dates[0];
      const end = dates[dates.length - 1];
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const diffMonths = Math.ceil(diffDays / 30);
      const diffYears = diffDays / 365.25;

      return {
        start: start.toISOString(),
        end: end.toISOString(),
        days: diffDays,
        months: diffMonths,
        years: Math.round(diffYears * 100) / 100
      };
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get timeline span');
      return {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        days: 0,
        months: 0,
        years: 0
      };
    }
  }

  /**
   * Get domain coverage
   */
  async getDomainCoverage(userId: string, atomCount?: number): Promise<DomainCoverage[]> {
    try {
      const atoms = await buildAtomsFromTimeline(userId);
      
      // Count atoms by domain
      const domainMap = new Map<Domain, number>();
      const domainEntryMap = new Map<Domain, Set<string>>();

      atoms.forEach(atom => {
        atom.domains.forEach(domain => {
          domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
          
          // Track unique entries per domain
          if (!domainEntryMap.has(domain)) {
            domainEntryMap.set(domain, new Set());
          }
          atom.timelineIds.forEach(id => {
            domainEntryMap.get(domain)!.add(id);
          });
        });
      });

      // Convert to array
      const coverage: DomainCoverage[] = [];
      domainMap.forEach((atomCount, domain) => {
        coverage.push({
          domain,
          atomCount,
          entryCount: domainEntryMap.get(domain)?.size || 0
        });
      });

      // Sort by atom count descending
      coverage.sort((a, b) => b.atomCount - a.atomCount);

      return coverage;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get domain coverage');
      return [];
    }
  }

  /**
   * Calculate content density
   */
  private calculateContentDensity(entries: any[], timelineSpan: TimelineSpan): ContentDensity {
    if (entries.length === 0 || timelineSpan.days === 0) {
      return {
        entriesPerMonth: 0,
        entriesPerYear: 0,
        averageWordsPerEntry: 0
      };
    }

    const months = timelineSpan.months || 1;
    const years = timelineSpan.years || timelineSpan.days / 365.25;

    // Calculate average words per entry
    let totalWords = 0;
    entries.forEach(entry => {
      const text = entry.content || entry.summary || '';
      const words = text.split(/\s+/).filter(w => w.length > 0);
      totalWords += words.length;
    });
    const averageWords = entries.length > 0 ? totalWords / entries.length : 0;

    return {
      entriesPerMonth: months > 0 ? entries.length / months : entries.length,
      entriesPerYear: years > 0 ? entries.length / years : entries.length * 365.25 / timelineSpan.days,
      averageWordsPerEntry: averageWords
    };
  }

  /**
   * Get most active periods
   */
  private getMostActivePeriods(entries: any[]): MostActivePeriod[] {
    const monthCounts = new Map<string, number>();

    entries.forEach(entry => {
      const dateStr = entry.date || entry.created_at || entry.timestamp;
      if (!dateStr) return;

      const date = new Date(dateStr);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
    });

    // Convert to array and sort
    const periods: MostActivePeriod[] = Array.from(monthCounts.entries())
      .map(([key, count]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return {
          month: date.toLocaleDateString('en-US', { month: 'long' }),
          year: parseInt(year),
          entryCount: count
        };
      })
      .sort((a, b) => b.entryCount - a.entryCount)
      .slice(0, 10); // Top 10

    return periods;
  }

  /**
   * Get journal entries (helper)
   */
  private async getJournalEntries(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, created_at, timestamp, content, summary')
        .eq('user_id', userId)
        .order('date', { ascending: true, nullsFirst: false });

      if (error) {
        logger.warn({ error, userId }, 'Failed to get journal entries');
        return [];
      }

      return data || [];
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get journal entries');
      return [];
    }
  }
}

export const contentAvailabilityService = new ContentAvailabilityService();
