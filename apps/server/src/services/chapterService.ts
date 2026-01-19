import { logger } from '../logger';
import type { Chapter, ChapterInput } from '../types';

import { supabaseAdmin } from './supabaseClient';

class ChapterService {
  async createChapter(userId: string, data: ChapterInput): Promise<Chapter> {
    try {
      const payload = {
        user_id: userId,
        title: data.title,
        start_date: data.startDate,
        end_date: data.endDate ?? null,
        description: data.description ?? null
      };

      const { data: created, error } = await supabaseAdmin
        .from('chapters')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logger.error({ error }, 'chapters table does not exist. Please run database migrations.');
          throw new Error('Database table "chapters" does not exist. Please run migrations.');
        }
        logger.error({ error }, 'Failed to create chapter');
        throw error;
      }

      return created as Chapter;
    } catch (error) {
      if (error instanceof Error && (error.message?.includes('does not exist') || (error as any).code === '42P01')) {
        throw new Error('Database table "chapters" does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  async listChapters(userId: string): Promise<Chapter[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chapters')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: false });

      if (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logger.warn('chapters table does not exist yet, returning empty array');
          return [];
        }
        logger.error({ error }, 'Failed to list chapters');
        throw error;
      }

      return (data ?? []) as Chapter[];
    } catch (error) {
      // If it's a table doesn't exist error, return empty array
      if (error instanceof Error && (error.message?.includes('does not exist') || (error as any).code === '42P01')) {
        logger.warn('chapters table does not exist yet, returning empty array');
        return [];
      }
      throw error;
    }
  }

  async getChapter(userId: string, chapterId: string): Promise<Chapter | null> {
    const { data, error } = await supabaseAdmin
      .from('chapters')
      .select('*')
      .eq('user_id', userId)
      .eq('id', chapterId)
      .single();

    if (error) {
      logger.error({ error }, 'Failed to fetch chapter');
      return null;
    }

    return data as Chapter;
  }

  async saveSummary(userId: string, chapterId: string, summary: string): Promise<Chapter | null> {
    const { data, error } = await supabaseAdmin
      .from('chapters')
      .update({ summary, updated_at: new Date().toISOString() })
      .eq('id', chapterId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error({ error }, 'Failed to save chapter summary');
      return null;
    }

    return data as Chapter;
  }
}

export const chapterService = new ChapterService();
