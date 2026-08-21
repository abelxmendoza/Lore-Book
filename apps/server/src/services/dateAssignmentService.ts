import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { parseMessageTimestamp } from '../utils/temporalResolver';
import {
  classifyJournalOccurrenceFromText,
  type JournalWriteOccurrence,
} from './temporal/journalOccurrenceWrite';

export type DateSuggestion = {
  date: Date | null;
  endDate?: Date | null;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'unresolved';
  context?: string;
  originalText?: string;
};

export type DateRangeSuggestion = {
  startDate: Date | null;
  endDate?: Date | null;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'unresolved';
};

function writeToSuggestion(write: JournalWriteOccurrence): DateSuggestion {
  const precision: DateSuggestion['precision'] =
    write.precision === 'time_of_day' ? 'hour'
      : write.precision === 'date' ? 'day'
        : write.precision === 'month' ? 'month'
          : write.precision === 'year' ? 'year'
            : 'day';
  if (!write.occurredAt) {
    return {
      date: null,
      endDate: null,
      precision: 'day',
      confidence: 0,
      source: 'unresolved',
      context: write.unresolvedReason ?? 'No occurrence evidence',
    };
  }
  return {
    date: new Date(write.occurredAt),
    endDate: write.occurredEnd ? new Date(write.occurredEnd) : null,
    precision,
    confidence: write.confidence,
    source: 'extracted',
    context: write.expression ?? undefined,
    originalText: write.expression ?? undefined,
  };
}

class DateAssignmentService {
  /**
   * Analyze content and suggest an occurrence date.
   * No temporal evidence returns unresolved (date: null) — never now().
   */
  async suggestDate(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
      relatedEntries?: Array<{ date: Date; content: string }>;
      now?: Date;
    }
  ): Promise<DateSuggestion> {
    const now = context?.now ?? new Date();
    const lexical = classifyJournalOccurrenceFromText(content, now);
    if (lexical.occurredAt || lexical.unresolvedReason === 'user said occurrence is unknown') {
      return writeToSuggestion(lexical);
    }

    try {
      const extracted = await this.extractExplicitDate(content, now);
      if (extracted && extracted.date && extracted.confidence > 0.7) {
        return extracted;
      }
    } catch (error) {
      logger.debug({ error, userId }, 'Date extraction failed; leaving occurrence unresolved');
    }

    return writeToSuggestion(lexical);
  }

  private async extractExplicitDate(content: string, now: Date): Promise<DateSuggestion | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract when the autobiographical event happened, not when the user wrote about it. Return JSON {date: ISO string or null, originalText, confidence: 0-1, context}. If the user does not know when it happened, or there is no event date, date must be null. Do not use the current time as a default.',
          },
          { role: 'user', content: content.substring(0, 2000) },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      if (!parsed.date) return null;

      const temporalRef = parseMessageTimestamp(parsed.date, now, false);
      if (temporalRef.confidence < 0.5) return null;

      return {
        date: temporalRef.timestamp,
        precision: temporalRef.precision,
        confidence: parsed.confidence || temporalRef.confidence || 0.7,
        source: 'extracted',
        context: parsed.context,
        originalText: parsed.originalText || temporalRef.originalText,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to extract explicit date');
      return null;
    }
  }

  async suggestDateRange(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
      now?: Date;
    }
  ): Promise<DateRangeSuggestion | null> {
    const now = context?.now ?? new Date();
    const lexical = classifyJournalOccurrenceFromText(content, now);
    if (lexical.occurredAt && lexical.occurredEnd) {
      return {
        startDate: new Date(lexical.occurredAt),
        endDate: new Date(lexical.occurredEnd),
        precision: lexical.precision === 'year' ? 'year' : lexical.precision === 'month' ? 'month' : 'day',
        confidence: lexical.confidence,
        source: 'extracted',
      };
    }
    if (!lexical.occurredAt) {
      return {
        startDate: null,
        endDate: null,
        precision: 'day',
        confidence: 0,
        source: 'unresolved',
      };
    }
    return {
      startDate: new Date(lexical.occurredAt),
      endDate: lexical.occurredEnd ? new Date(lexical.occurredEnd) : null,
      precision: 'day',
      confidence: lexical.confidence,
      source: 'extracted',
    };
  }
}

export const dateAssignmentService = new DateAssignmentService();
