import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';
import { timeEngine } from './timeEngine';

export type DateSuggestion = {
  date: Date;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'default';
  context?: string;
  originalText?: string;
};

export type DateRangeSuggestion = {
  startDate: Date;
  endDate?: Date;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'default';
};

class DateAssignmentService {
  /**
   * Analyze content and suggest a date with confidence score
   */
  async suggestDate(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
      relatedEntries?: Array<{ date: Date; content: string }>;
    }
  ): Promise<DateSuggestion> {
    try {
      // First, try to extract explicit dates from content
      const extracted = await this.extractExplicitDate(content);
      if (extracted && extracted.confidence > 0.7) {
        return extracted;
      }

      // Try to infer from context
      if (context) {
        const inferred = this.inferFromContext(content, context);
        if (inferred && inferred.confidence > 0.6) {
          return inferred;
        }
      }

      // Try to find similar entries and use their dates
      const similarDate = await this.findSimilarEntryDate(userId, content);
      if (similarDate && similarDate.confidence > 0.5) {
        return similarDate;
      }

      // Default to current time with low confidence
      return {
        date: new Date(),
        precision: 'day',
        confidence: 0.2,
        source: 'default',
        context: 'No date found, using current date'
      };
    } catch (error) {
      logger.error({ error }, 'Failed to suggest date');
      return {
        date: new Date(),
        precision: 'day',
        confidence: 0.1,
        source: 'default',
        context: 'Error occurred, using current date'
      };
    }
  }

  /**
   * Extract explicit date from content using OpenAI
   */
  private async extractExplicitDate(content: string): Promise<DateSuggestion | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract the primary date or time reference from the text. Return JSON with {date: ISO string or null, originalText: the text that contained the date, confidence: 0-1, context: brief description}. If no clear date found, return null for date.'
          },
          {
            role: 'user',
            content: content.substring(0, 2000) // Limit content length
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      
      if (!parsed.date) {
        return null;
      }

      // Parse the date using TimeEngine
      const temporalRef = timeEngine.parseTimestamp(parsed.date);
      
      return {
        date: temporalRef.timestamp,
        precision: temporalRef.precision,
        confidence: parsed.confidence || temporalRef.confidence || 0.7,
        source: 'extracted',
        context: parsed.context,
        originalText: parsed.originalText || temporalRef.originalText
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to extract explicit date');
      return null;
    }
  }

  /**
   * Infer date from context (previous entries, chapters, etc.)
   */
  private inferFromContext(
    content: string,
    context: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
      relatedEntries?: Array<{ date: Date; content: string }>;
    }
  ): DateSuggestion | null {
    // If there's a previous entry date, suggest a date shortly after
    if (context.previousEntryDate) {
      const suggestedDate = new Date(context.previousEntryDate);
      suggestedDate.setDate(suggestedDate.getDate() + 1); // Default to next day
      
      return {
        date: suggestedDate,
        precision: 'day',
        confidence: 0.6,
        source: 'inferred',
        context: 'Inferred from previous entry date'
      };
    }

    // If within a chapter, suggest a date within that range
    if (context.chapterStartDate && context.chapterEndDate) {
      const midDate = new Date(
        (context.chapterStartDate.getTime() + context.chapterEndDate.getTime()) / 2
      );
      
      return {
        date: midDate,
        precision: 'day',
        confidence: 0.5,
        source: 'inferred',
        context: 'Inferred from chapter date range'
      };
    }

    // Check related entries for similar content
    if (context.relatedEntries && context.relatedEntries.length > 0) {
      // Use the most recent related entry's date
      const mostRecent = context.relatedEntries[0];
      return {
        date: mostRecent.date,
        precision: 'day',
        confidence: 0.55,
        source: 'inferred',
        context: 'Inferred from related entry'
      };
    }

    return null;
  }

  /**
   * Find similar entries and use their dates
   */
  private async findSimilarEntryDate(
    userId: string,
    content: string
  ): Promise<DateSuggestion | null> {
    try {
      // Get recent entries to find similar content
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('date, content')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(50);

      if (!entries || entries.length === 0) {
        return null;
      }

      // Simple similarity check (could be enhanced with embeddings)
      const contentLower = content.toLowerCase();
      const keywords = contentLower.split(/\s+/).filter(w => w.length > 3).slice(0, 5);

      for (const entry of entries) {
        const entryContent = (entry.content || '').toLowerCase();
        const matches = keywords.filter(kw => entryContent.includes(kw)).length;
        
        if (matches >= 2) {
          return {
            date: new Date(entry.date),
            precision: 'day',
            confidence: 0.5 + (matches / keywords.length) * 0.2,
            source: 'context',
            context: `Found similar entry from ${new Date(entry.date).toLocaleDateString()}`
          };
        }
      }

      return null;
    } catch (error) {
      logger.debug({ error }, 'Failed to find similar entry date');
      return null;
    }
  }

  /**
   * Suggest a date range for content that spans time
   */
  async suggestDateRange(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
    }
  ): Promise<DateRangeSuggestion | null> {
    try {
      // Try to extract date range from content
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract date range from text (start and end dates). Return JSON with {startDate: ISO string or null, endDate: ISO string or null, confidence: 0-1}. Look for phrases like "from X to Y", "during Z", "between A and B".'
          },
          {
            role: 'user',
            content: content.substring(0, 2000)
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      
      if (parsed.startDate && parsed.endDate) {
        const startRef = timeEngine.parseTimestamp(parsed.startDate);
        const endRef = timeEngine.parseTimestamp(parsed.endDate);
        
        return {
          startDate: startRef.timestamp,
          endDate: endRef.timestamp,
          precision: startRef.precision,
          confidence: parsed.confidence || 0.7,
          source: 'extracted'
        };
      }

      // If no range found, try to infer from context
      if (context?.chapterStartDate && context?.chapterEndDate) {
        return {
          startDate: context.chapterStartDate,
          endDate: context.chapterEndDate,
          precision: 'day',
          confidence: 0.5,
          source: 'inferred'
        };
      }

      return null;
    } catch (error) {
      logger.debug({ error }, 'Failed to suggest date range');
      return null;
    }
  }
}

export const dateAssignmentService = new DateAssignmentService();

