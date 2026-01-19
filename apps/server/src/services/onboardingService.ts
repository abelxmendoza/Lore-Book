import { formatISO } from 'date-fns';
import { v4 as uuid } from 'uuid';

import type { MemoryEntry } from '../types';

import { memoryService } from './memoryService';

export type ImportPayload = {
  files?: { name: string; content?: string }[];
  calendar?: boolean;
  photos?: boolean;
};

class OnboardingService {
  async initialize(userId: string): Promise<{ entry: MemoryEntry }> {
    const entry = await memoryService.saveEntry({
      userId,
      content: 'Welcome to LoreKeeper. Book Zero has been created.',
      tags: ['onboarding', 'started_lorekeeper'],
      source: 'system'
    });
    return { entry };
  }

  async importMemories(userId: string, payload: ImportPayload): Promise<{ imported: number }> {
    let imported = 0;
    const now = formatISO(new Date());

    if (payload.files?.length) {
      for (const file of payload.files) {
        await memoryService.saveEntry({
          userId,
          content: file.content ?? `Imported ${file.name}`,
          tags: ['onboarding', 'imported'],
          source: 'api',
          metadata: { file: file.name, type: 'import_wizard' },
          date: now
        });
        imported += 1;
      }
    }

    if (payload.calendar) {
      await memoryService.saveEntry({
        userId,
        content: 'Calendar sync enabled during onboarding.',
        tags: ['onboarding', 'calendar'],
        source: 'calendar',
        metadata: { onboarding: true },
        date: now
      });
      imported += 1;
    }

    if (payload.photos) {
      await memoryService.saveEntry({
        userId,
        content: 'Photo metadata import enabled during onboarding.',
        tags: ['onboarding', 'photos'],
        source: 'photo',
        metadata: { onboarding: true },
        date: now
      });
      imported += 1;
    }

    if (!imported) {
      await memoryService.saveEntry({
        userId,
        content: 'No imports selected. Generated sample onboarding data.',
        tags: ['onboarding', 'sample'],
        source: 'system',
        date: now,
        metadata: { id: uuid() }
      });
    }

    return { imported };
  }

  async generateBriefing(userId: string): Promise<{ briefing: Record<string, unknown> }> {
    const entries = await memoryService.searchEntries(userId, { tag: 'onboarding', limit: 20 });
    const tags = new Map<string, number>();
    entries.forEach((entry) => {
      entry.tags.forEach((tag) => tags.set(tag, (tags.get(tag) ?? 0) + 1));
    });

    const earlyThemes = Array.from(tags.entries())
      .filter(([tag]) => tag !== 'onboarding')
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 5);

    return {
      briefing: {
        identity_baseline: { created_at: entries.at(-1)?.date },
        early_themes: earlyThemes,
        observations: entries.map((entry) => entry.content).slice(0, 5),
        suggestions: ['Tag important people', 'Schedule your first weekly briefing', 'Add goals for the month'],
        recommended_workflows: [
          'Use the import wizard to backfill notes',
          'Enable calendar and photos for context',
          'Write a short origin story in Book Zero'
        ]
      }
    };
  }
}

export const onboardingService = new OnboardingService();
