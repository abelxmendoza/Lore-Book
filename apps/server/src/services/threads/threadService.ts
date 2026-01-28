/**
 * ThreadService - CRUD for recurring threads (Omega1, Love Life, etc.)
 */

import { supabaseAdmin } from '../supabaseClient';
import type {
  Thread,
  ThreadCategory,
  ThreadCreatePayload,
  ThreadUpdatePayload,
  ThreadFilters
} from '../../types/threads';

export class ThreadService {
  async create(userId: string, payload: ThreadCreatePayload): Promise<Thread> {
    const { data, error } = await supabaseAdmin
      .from('threads')
      .insert({
        user_id: userId,
        name: payload.name,
        description: payload.description ?? null,
        category: payload.category ?? null,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data as Thread;
  }

  async getById(userId: string, id: string): Promise<Thread | null> {
    const { data, error } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as Thread | null;
  }

  async listByUser(userId: string, filters?: ThreadFilters): Promise<Thread[]> {
    let q = supabaseAdmin
      .from('threads')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (filters?.category) {
      q = q.eq('category', filters.category);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Thread[];
  }

  /** Find thread by name for user, or create if not found (for backward-storytelling arc wiring). */
  async findOrCreateByName(userId: string, name: string): Promise<Thread> {
    const { data: existing } = await supabaseAdmin
      .from('threads')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle();

    if (existing) return existing as Thread;
    return this.create(userId, { name: name.trim() });
  }

  async update(userId: string, id: string, payload: ThreadUpdatePayload): Promise<Thread> {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.category !== undefined) updates.category = payload.category;

    const { data, error } = await supabaseAdmin
      .from('threads')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Thread;
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('threads')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

export const threadService = new ThreadService();
