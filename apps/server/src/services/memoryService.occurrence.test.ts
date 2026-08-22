import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));
vi.mock('./dateAssignmentService', () => ({
  dateAssignmentService: {
    suggestDate: vi.fn().mockResolvedValue({
      date: new Date(),
      precision: 'day',
      confidence: 0.2,
      source: 'default',
    }),
  },
}));
vi.mock('./embeddingService', () => ({
  embeddingService: { embedText: vi.fn().mockRejectedValue(new Error('skip embed')) },
}));
vi.mock('./peoplePlacesService', () => ({
  peoplePlacesService: { recordEntitiesForEntry: vi.fn().mockResolvedValue([]) },
}));
vi.mock('./unifiedErIngestion', () => ({
  ingestJournalEntry: vi.fn(),
}));
vi.mock('../engineRuntime/triggers', () => ({
  onNewEntry: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./skills/skillExtractionService', () => ({
  skillExtractionService: { processEntryForSkills: vi.fn().mockResolvedValue([]) },
}));
vi.mock('./quests/questSuggestionService', () => ({
  questSuggestionService: { processEntryForQuestSuggestions: vi.fn().mockResolvedValue(0) },
}));
vi.mock('./projects/projectSuggestionService', () => ({
  projectSuggestionService: { processEntryForProjectSuggestions: vi.fn().mockResolvedValue(0) },
}));
vi.mock('./characterFoundationService', () => ({
  characterFoundationService: { promoteEntityToCharacter: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { memoryService } from './memoryService';
import { supabaseAdmin } from './supabaseClient';
import { dateAssignmentService } from './dateAssignmentService';

describe('memoryService.saveEntry occurrence contract', () => {
  const inserted: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    inserted.length = 0;
    vi.clearAllMocks();
    vi.mocked(dateAssignmentService.suggestDate).mockResolvedValue({
      date: new Date(),
      precision: 'day',
      confidence: 0.2,
      source: 'default',
    });
    vi.mocked(supabaseAdmin.from).mockImplementation(() => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { data: null, error: null };
      }),
    }) as any);
  });

  it('omits occurrence when the caller provides no date and extraction is default', async () => {
    const entry = await memoryService.saveEntry({
      userId: 'user-maya',
      content: 'Maya works at Vanguard Robotics on the MemoVault deployment team.',
      source: 'document_upload',
      importedAt: '2026-08-21T12:00:00.000Z',
    });

    expect(entry.date).toBeNull();
    expect(inserted[0]?.date).toBeNull();
    expect(inserted[0]?.timestamp).toBeNull();
    expect(inserted[0]?.time_precision).toBe('approximate');
    expect((inserted[0]?.metadata as { occurrenceStatus?: string }).occurrenceStatus).toBe('unresolved');
  });

  it('keeps an explicit user-stated date', async () => {
    const entry = await memoryService.saveEntry({
      userId: 'user-maya',
      content: 'I started the job today.',
      date: '2026-08-21T15:00:00.000Z',
      temporalSource: 'user_stated',
    });

    expect(entry.date).toBe('2026-08-21T15:00:00.000Z');
    expect(inserted[0]?.date).toBe('2026-08-21T15:00:00.000Z');
  });

  it('does not fall back to now() when date assignment returns source=default', async () => {
    const before = Date.now();
    const entry = await memoryService.saveEntry({
      userId: 'user-jamie',
      content: 'Short note about MemoVault without any when.',
    });
    const after = Date.now();
    expect(entry.date).toBeNull();
    if (typeof inserted[0]?.date === 'string') {
      const t = new Date(inserted[0].date as string).getTime();
      expect(t < before || t > after).toBe(true);
    }
  });
});
