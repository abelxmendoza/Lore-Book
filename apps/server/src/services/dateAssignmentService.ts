import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';
import { parseMessageTimestamp, resolveTemporalWindow } from '../utils/temporalResolver';

export type DateSuggestion = {
  date: Date | null;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'unknown';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'default' | 'unresolved';
  context?: string;
  originalText?: string;
};

export type DateRangeSuggestion = {
  startDate: Date;
  endDate?: Date;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  confidence: number;
  source: 'extracted' | 'inferred' | 'context' | 'default' | 'unresolved';
};

const UNKNOWN_OCCURRENCE =
  /\b((i )?don'?t (remember|know) when( this happened)?|not sure when (this|it) happened|i don't know when it happened)\b/i;
const WROTE_TODAY = /\b(i (wrote|am writing) this today|writing this today|wrote this today)\b/i;
const HAPPENED_NOW =
  /\b(today (i|we)\b|(i|we) (went|saw|met|were|was|am|are) .{0,40}\b(today|this morning|tonight|right now)\b|happened today|happening right now|i am .{0,40}right now|right now (i|we)\b)\b/i;
const EXPLICIT_NOW = /\b(today|right now|this morning|this afternoon|tonight)\b/i;
const RELATIVE_PAST = /\b(yesterday|last month|last year|last summer|last week|ago)\b/i;

function unresolved(context: string, originalText?: string): DateSuggestion {
  return {
    date: null,
    precision: 'unknown',
    confidence: 1,
    source: 'unresolved',
    context,
    originalText,
  };
}

function mapWindowPrecision(
  precision: string | undefined,
): DateSuggestion['precision'] {
  if (precision === 'year') return 'year';
  if (precision === 'month' || precision === 'season' || precision === 'quarter') return 'month';
  if (precision === 'hour') return 'hour';
  return 'day';
}

/**
 * Lexical occurrence extractor. `new Date()` / `now` is occurrence only when
 * the source actually establishes today / right now as the event time.
 */
export function extractLexicalOccurrence(
  content: string,
  now: Date = new Date(),
): DateSuggestion | null {
  const text = content.trim();
  if (!text) return unresolved('Empty content has no occurrence');

  if (UNKNOWN_OCCURRENCE.test(text)) {
    return unresolved('Text says occurrence is unknown', text.match(UNKNOWN_OCCURRENCE)?.[0]);
  }

  if (WROTE_TODAY.test(text) && !HAPPENED_NOW.test(text)) {
    return unresolved('Today refers to recording, not occurrence', 'today');
  }

  if (HAPPENED_NOW.test(text) || (EXPLICIT_NOW.test(text) && !RELATIVE_PAST.test(text) && !WROTE_TODAY.test(text))) {
    const matched = text.match(EXPLICIT_NOW)?.[0] ?? 'today';
    return {
      date: now,
      precision: /right now/i.test(matched) ? 'hour' : 'day',
      confidence: 0.9,
      source: 'extracted',
      context: 'Explicit present-tense occurrence',
      originalText: matched,
    };
  }

  const window = resolveTemporalWindow(text, now);
  if (window && window.confidence >= 0.5) {
    return {
      date: window.start,
      precision: mapWindowPrecision(window.precision),
      confidence: window.confidence,
      source: 'extracted',
      context: 'Resolved temporal expression from content',
      originalText: window.label,
    };
  }

  return null;
}

class DateAssignmentService {
  /**
   * Analyze content and suggest an OCCURRENCE date.
   * No temporal information → unresolved (date null), never now.
   */
  async suggestDate(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
      relatedEntries?: Array<{ date: Date; content: string }>;
    },
    now: Date = new Date(),
  ): Promise<DateSuggestion> {
    void userId;
    void context;
    try {
      const lexical = extractLexicalOccurrence(content, now);
      if (lexical) return lexical;

      const extracted = await this.extractExplicitDate(content, now);
      if (extracted && extracted.date && extracted.confidence > 0.7 && extracted.source !== 'unresolved') {
        return extracted;
      }

      return unresolved('No date found; occurrence stays unknown');
    } catch (error) {
      logger.error({ error }, 'Failed to suggest date');
      return unresolved('Error occurred; occurrence stays unknown');
    }
  }

  /**
   * Extract explicit date from content using OpenAI, then parse without defaulting to now.
   */
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
              'Extract when the described event happened, not when the journal was written. Return JSON with {date: ISO string or null, originalText, confidence: 0-1, context}. If the writer does not know when it happened, or the only time words refer to writing ("I wrote this today"), return date null.',
          },
          {
            role: 'user',
            content: content.substring(0, 2000),
          },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

      if (!parsed.date) {
        return unresolved('Model found no occurrence date', parsed.originalText);
      }

      const temporalRef = parseMessageTimestamp(parsed.date, now, false);
      if (!temporalRef || temporalRef.confidence < 0.5) {
        return null;
      }

      return {
        date: temporalRef.timestamp,
        precision: temporalRef.precision === 'year' || temporalRef.precision === 'month' || temporalRef.precision === 'hour' || temporalRef.precision === 'minute' || temporalRef.precision === 'second'
          ? temporalRef.precision
          : 'day',
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

  /**
   * Suggest a date range for content that spans time.
   * Does not default a missing range to now.
   */
  async suggestDateRange(
    userId: string,
    content: string,
    context?: {
      previousEntryDate?: Date;
      chapterStartDate?: Date;
      chapterEndDate?: Date;
    },
    now: Date = new Date(),
  ): Promise<DateRangeSuggestion | null> {
    void userId;
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract the occurrence date range from text (start and end). Return JSON with {startDate: ISO string or null, endDate: ISO string or null, confidence: 0-1}. Do not use the writing/recording time.',
          },
          {
            role: 'user',
            content: content.substring(0, 2000),
          },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');

      if (parsed.startDate && parsed.endDate) {
        const startRef = parseMessageTimestamp(parsed.startDate, now, false);
        const endRef = parseMessageTimestamp(parsed.endDate, now, false);
        if (startRef.confidence < 0.5 || endRef.confidence < 0.5) return null;

        return {
          startDate: startRef.timestamp,
          endDate: endRef.timestamp,
          precision: startRef.precision === 'year' || startRef.precision === 'month' ? startRef.precision : 'day',
          confidence: parsed.confidence || 0.7,
          source: 'extracted',
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
