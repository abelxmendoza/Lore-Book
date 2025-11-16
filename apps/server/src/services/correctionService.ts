import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type { EntryCorrection, MemoryEntry, ResolvedMemoryEntry } from '../types';
import { supabaseAdmin } from './supabaseClient';

export type CorrectionPayload = {
  correctedContent: string;
  note?: string;
  reason?: string;
};

class CorrectionService {
  private extractCorrections(entry: MemoryEntry | ResolvedMemoryEntry): EntryCorrection[] {
    const metadata = (entry.metadata as { corrections?: EntryCorrection[] } | undefined) ?? {};
    return metadata.corrections ?? [];
  }

  applyCorrections(entry: MemoryEntry): ResolvedMemoryEntry {
    const corrections = this.extractCorrections(entry);
    const latest = corrections.at(-1);

    return {
      ...entry,
      corrections,
      corrected_content: latest?.corrected_text ?? entry.content,
      resolution_notes: latest?.note
    };
  }

  applyCorrectionsToEntries(entries: MemoryEntry[]): ResolvedMemoryEntry[] {
    return entries.map((entry) => this.applyCorrections(entry));
  }

  async getEntryWithCorrections(userId: string, entryId: string): Promise<ResolvedMemoryEntry | null> {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('id', entryId)
      .single();

    if (error) {
      logger.error({ error }, 'Failed to fetch entry for corrections');
      return null;
    }

    return data ? this.applyCorrections(data as MemoryEntry) : null;
  }

  async addCorrection(userId: string, entryId: string, payload: CorrectionPayload): Promise<EntryCorrection> {
    const existing = await this.getEntryWithCorrections(userId, entryId);
    if (!existing) {
      throw new Error('Entry not found');
    }

    const correction: EntryCorrection = {
      id: uuid(),
      corrected_text: payload.correctedContent,
      note: payload.note,
      reason: payload.reason,
      author: userId,
      created_at: new Date().toISOString()
    };

    const metadata = existing.metadata ?? {};
    const corrections = this.extractCorrections(existing);
    const updatedMetadata = { ...metadata, corrections: [...corrections, correction] };

    const { error } = await supabaseAdmin
      .from('journal_entries')
      .update({ metadata: updatedMetadata })
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error }, 'Failed to append correction');
      throw error;
    }

    return correction;
  }
}

export const correctionService = new CorrectionService();
