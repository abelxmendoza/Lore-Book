import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import type { Chapter, ChapterInput } from '../types';

class ChapterService {
  async createChapter(userId: string, data: ChapterInput): Promise<Chapter> {
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
      logger.error({ error }, 'Failed to create chapter');
      throw error;
    }

    return created as Chapter;
  }

  async listChapters(userId: string): Promise<Chapter[]> {
    const { data, error } = await supabaseAdmin
      .from('chapters')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      logger.error({ error }, 'Failed to list chapters');
      throw error;
    }

    return (data ?? []) as Chapter[];
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
