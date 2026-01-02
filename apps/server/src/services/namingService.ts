import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

class NamingService {
  async generateChapterName(userId: string, chapterId: string, entries: Array<{ content: string; date: string }>): Promise<string> {
    if (entries.length === 0) {
      return 'Untitled Chapter';
    }

    try {
      const content = entries
        .slice(0, 10)
        .map((e) => `Date: ${e.date}\n${e.content}`)
        .join('\n---\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              'Generate a compelling, concise chapter title (2-6 words) based on the journal entries. Make it evocative and meaningful. Examples: "The Awakening", "City Lights", "First Steps", "Breaking Point". Return only the title, no quotes.'
          },
          {
            role: 'user',
            content: `Journal entries:\n${content}\n\nGenerate a chapter title:`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || 'Untitled Chapter';
      return title.replace(/^["']|["']$/g, ''); // Remove quotes if present
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate chapter name');
      return 'Untitled Chapter';
    }
  }

  async generateSagaName(userId: string, chapters: Array<{ title: string; summary?: string }>): Promise<string> {
    if (chapters.length === 0) {
      return 'Untitled Saga';
    }

    try {
      const content = chapters
        .map((c) => `Chapter: ${c.title}\n${c.summary || ''}`)
        .join('\n---\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content:
              'Generate a compelling saga/arc name (2-5 words) that captures the overarching theme of these chapters. Make it epic and memorable. Examples: "The Journey Begins", "Trials of Fire", "New Horizons". Return only the name, no quotes.'
          },
          {
            role: 'user',
            content: `Chapters:\n${content}\n\nGenerate a saga name:`
          }
        ]
      });

      const name = completion.choices[0]?.message?.content?.trim() || 'Untitled Saga';
      return name.replace(/^["']|["']$/g, '');
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate saga name');
      return 'Untitled Saga';
    }
  }

  async generateMemoir(userId: string, options?: { focus?: string; period?: { from?: string; to?: string } }): Promise<string> {
    try {
      // Build query
      let query = supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId);

      // Apply date filters if provided
      if (options?.period?.from) {
        query = query.gte('date', options.period.from);
      }
      if (options?.period?.to) {
        query = query.lte('date', options.period.to);
      }

      const { data: entriesData } = await query.order('date', { ascending: false }).limit(100);

      if (!entriesData || entriesData.length === 0) {
        return 'Not enough memories yet to generate a memoir. Keep journaling!';
      }

      const entries = entriesData.map((e: any) => ({
        date: e.date,
        content: e.content,
        summary: e.summary
      }));

      if (entries.length === 0) {
        return 'Not enough memories yet to generate a memoir. Keep journaling!';
      }

      const content = entries
        .slice(0, 50)
        .map((e) => `Date: ${e.date}\n${e.summary || e.content}`)
        .join('\n---\n');

      const prompt = options?.focus
        ? `Write a memoir chapter focusing on: ${options.focus}\n\nMemories:\n${content}`
        : `Write a memoir based on these journal entries. Capture the essence, growth, and key moments. Make it personal and reflective.\n\nMemories:\n${content}`;

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.8,
        messages: [
          {
            role: 'system',
            content:
              'You are a memoir writer. Write in first person, be reflective and personal. Capture the emotional journey, key moments, and growth. Write 3-5 paragraphs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Unable to generate memoir at this time.';
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate memoir');
      return 'Failed to generate memoir. Please try again later.';
    }
  }
}

export const namingService = new NamingService();

