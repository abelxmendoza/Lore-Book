/**
 * Title Generation Service
 * Automatically generates compelling titles for arcs, sagas, eras, memories, and other timeline elements
 * based on their content and story context
 */

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { memoryService } from './memoryService';
import { ruleBasedTitleGenerationService } from './ruleBasedTitleGeneration';
import { supabaseAdmin } from './supabaseClient';
import { timelineManager } from './timelineManager';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type TitleGenerationOptions = {
  type: 'arc' | 'saga' | 'era' | 'memory' | 'chapter' | 'scene';
  content?: string;
  entries?: Array<{ content: string; date: string; summary?: string }>;
  dateRange?: { from: string; to?: string };
  existingTitles?: string[];
  context?: string;
};

class TitleGenerationService {
  /**
   * Generate a title for a memory/entry based on its content
   */
  async generateMemoryTitle(
    userId: string,
    content: string,
    date?: string,
    context?: { relatedEntries?: Array<{ content: string; date: string }> }
  ): Promise<string> {
    try {
      // Use rule-based title generation first (FREE - no API call)
      const ruleBasedTitle = ruleBasedTitleGenerationService.generateEntryTitle(content, date);
      
      // If rule-based title is good enough (not generic), use it
      if (ruleBasedTitle && ruleBasedTitle !== 'Untitled Memory' && ruleBasedTitle.length > 10) {
        return ruleBasedTitle;
      }

      // Fallback to API only if rule-based didn't produce good title
      const relatedContext = context?.relatedEntries
        ? `\n\nRelated entries:\n${context.relatedEntries.slice(0, 3).map(e => `[${e.date}] ${e.content.substring(0, 100)}`).join('\n')}`
        : '';

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a concise, evocative title (3-8 words) for a journal entry/memory. 
The title should capture the essence, emotion, or key moment. 
Examples: "Morning Coffee with Sarah", "The Big Decision", "First Day at New Job", "Sunset Over the City", "Breaking the News".
Return only the title, no quotes or extra text.`
          },
          {
            role: 'user',
            content: `Generate a title for this memory:\n${date ? `Date: ${date}\n` : ''}Content: ${content.substring(0, 1000)}${relatedContext}`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || ruleBasedTitle;
      return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');
    } catch (error) {
      logger.error({ error }, 'Failed to generate memory title, using rule-based');
      // Fallback to rule-based on error
      return ruleBasedTitleGenerationService.generateEntryTitle(content, date);
    }
  }

  /**
   * Generate a title for an arc based on entries within its date range
   */
  async generateArcTitle(
    userId: string,
    entries: Array<{ content: string; date: string; summary?: string }>,
    dateRange?: { from: string; to?: string },
    parentSagaTitle?: string
  ): Promise<string> {
    if (entries.length === 0) {
      return 'Untitled Arc';
    }

    try {
      const content = entries
        .slice(0, 15)
        .map((e) => `[${e.date}] ${e.summary || e.content.substring(0, 150)}`)
        .join('\n---\n');

      const context = parentSagaTitle ? `\nPart of saga: ${parentSagaTitle}` : '';
      const dateContext = dateRange ? `\nDate range: ${dateRange.from}${dateRange.to ? ` to ${dateRange.to}` : ''}` : '';

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a compelling arc title (2-5 words) that captures the narrative arc and key themes.
Examples: "First Steps", "Breaking Through", "The Challenge", "Turning Point", "New Horizons", "The Awakening".
Return only the title, no quotes.`
          },
          {
            role: 'user',
            content: `Generate an arc title based on these memories:\n${content}${dateContext}${context}`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || 'Untitled Arc';
      return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');
    } catch (error) {
      logger.error({ error }, 'Failed to generate arc title');
      return 'Untitled Arc';
    }
  }

  /**
   * Generate a title for a saga based on arcs or entries
   */
  async generateSagaTitle(
    userId: string,
    arcs?: Array<{ title: string; description?: string }>,
    entries?: Array<{ content: string; date: string; summary?: string }>,
    dateRange?: { from: string; to?: string }
  ): Promise<string> {
    try {
      let content = '';
      
      if (arcs && arcs.length > 0) {
        content = arcs
          .slice(0, 10)
          .map((a) => `Arc: ${a.title}${a.description ? ` - ${a.description}` : ''}`)
          .join('\n');
      } else if (entries && entries.length > 0) {
        content = entries
          .slice(0, 20)
          .map((e) => `[${e.date}] ${e.summary || e.content.substring(0, 100)}`)
          .join('\n---\n');
      } else {
        return 'Untitled Saga';
      }

      const dateContext = dateRange ? `\nDate range: ${dateRange.from}${dateRange.to ? ` to ${dateRange.to}` : ''}` : '';

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a compelling saga title (2-5 words) that captures the overarching narrative theme.
Examples: "Building the Business", "Finding My Voice", "The Adventure", "New Horizons", "The Journey Begins", "Trials of Fire".
Return only the title, no quotes.`
          },
          {
            role: 'user',
            content: `Generate a saga title:\n${content}${dateContext}`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || 'Untitled Saga';
      return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');
    } catch (error) {
      logger.error({ error }, 'Failed to generate saga title');
      return 'Untitled Saga';
    }
  }

  /**
   * Generate a title for an era based on sagas or entries
   */
  async generateEraTitle(
    userId: string,
    sagas?: Array<{ title: string; description?: string }>,
    entries?: Array<{ content: string; date: string; summary?: string }>,
    dateRange?: { from: string; to?: string }
  ): Promise<string> {
    try {
      let content = '';
      
      if (sagas && sagas.length > 0) {
        content = sagas
          .slice(0, 10)
          .map((s) => `Saga: ${s.title}${s.description ? ` - ${s.description}` : ''}`)
          .join('\n');
      } else if (entries && entries.length > 0) {
        content = entries
          .slice(0, 30)
          .map((e) => `[${e.date}] ${e.summary || e.content.substring(0, 100)}`)
          .join('\n---\n');
      } else {
        return 'Untitled Era';
      }

      const dateContext = dateRange ? `\nDate range: ${dateRange.from}${dateRange.to ? ` to ${dateRange.to}` : ''}` : '';

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a compelling era title (2-4 words) that captures a significant life period.
Examples: "The Startup Phase", "The Learning Period", "Creative Surge", "Reflection Time", "College Years", "Career Beginnings".
Return only the title, no quotes.`
          },
          {
            role: 'user',
            content: `Generate an era title:\n${content}${dateContext}`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || 'Untitled Era';
      return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');
    } catch (error) {
      logger.error({ error }, 'Failed to generate era title');
      return 'Untitled Era';
    }
  }

  /**
   * Generate a summary/title for an entry based on its content
   */
  async generateEntrySummary(
    userId: string,
    content: string,
    date?: string
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content: `Generate a concise summary (1-2 sentences, max 150 characters) for a journal entry.
Capture the key point, emotion, or event. Be specific and meaningful.`
          },
          {
            role: 'user',
            content: `Generate a summary for this entry:\n${date ? `Date: ${date}\n` : ''}Content: ${content.substring(0, 2000)}`
          }
        ]
      });

      const summary = completion.choices[0]?.message?.content?.trim() || '';
      return summary.substring(0, 200); // Limit length
    } catch (error) {
      logger.error({ error }, 'Failed to generate entry summary');
      return '';
    }
  }

  /**
   * Auto-generate title for a timeline node based on its content
   */
  async generateTitleForTimelineNode(
    userId: string,
    type: 'arc' | 'saga' | 'era',
    dateRange: { from: string; to?: string },
    parentTitle?: string
  ): Promise<string> {
    try {
      // Get entries within date range
      const entriesQuery = supabaseAdmin
        .from('journal_entries')
        .select('content, summary, date')
        .eq('user_id', userId)
        .gte('date', dateRange.from)
        .order('date', { ascending: true })
        .limit(30);

      if (dateRange.to) {
        entriesQuery.lte('date', dateRange.to);
      }

      const { data: entries } = await entriesQuery;

      if (!entries || entries.length === 0) {
        return `Untitled ${type}`;
      }

      const entriesData = entries.map((e: any) => ({
        content: e.content,
        date: e.date,
        summary: e.summary
      }));

      switch (type) {
        case 'arc':
          return await this.generateArcTitle(userId, entriesData, dateRange, parentTitle);
        case 'saga':
          // Try to get arcs first
          const arcsQuery = supabaseAdmin
            .from('timeline_arcs')
            .select('title, description')
            .eq('user_id', userId)
            .gte('start_date', dateRange.from)
            .order('start_date', { ascending: true })
            .limit(10);
          
          if (dateRange.to) {
            arcsQuery.lte('start_date', dateRange.to);
          }
          
          const { data: arcs } = await arcsQuery;
          
          if (arcs && arcs.length > 0) {
            return await this.generateSagaTitle(
              userId,
              arcs.map((a: any) => ({ title: a.title, description: a.description })),
              undefined,
              dateRange
            );
          }
          
          return await this.generateSagaTitle(userId, undefined, entriesData, dateRange);
        case 'era':
          // Try to get sagas first
          const sagasQuery = supabaseAdmin
            .from('timeline_sagas')
            .select('title, description')
            .eq('user_id', userId)
            .gte('start_date', dateRange.from)
            .order('start_date', { ascending: true })
            .limit(10);
          
          if (dateRange.to) {
            sagasQuery.lte('start_date', dateRange.to);
          }
          
          const { data: sagas } = await sagasQuery;
          
          if (sagas && sagas.length > 0) {
            return await this.generateEraTitle(
              userId,
              sagas.map((s: any) => ({ title: s.title, description: s.description })),
              undefined,
              dateRange
            );
          }
          
          return await this.generateEraTitle(userId, undefined, entriesData, dateRange);
        default:
          return `Untitled ${type}`;
      }
    } catch (error) {
      logger.error({ error, type }, 'Failed to generate title for timeline node');
      return `Untitled ${type}`;
    }
  }
}

export const titleGenerationService = new TitleGenerationService();

