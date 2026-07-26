import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../characterRegistry', () => ({
  characterRegistry: {
    runExclusive: vi.fn((_userId: string, fn: () => Promise<unknown>) => fn()),
    classifyForCreation: vi.fn(),
    mergeMention: vi.fn().mockResolvedValue(undefined),
    recordPendingQuestion: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../entityFactsService', () => ({
  entityFactsService: {
    extractAndPersistFacts: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./castRosterQueryService', () => ({
  classifyCastForActiveStory: vi.fn(),
}));

vi.mock('../conversationCentered/threadContentService', () => ({
  loadThreadMessages: vi.fn().mockResolvedValue([]),
}));

import { supabaseAdmin } from '../supabaseClient';
import { characterRegistry } from '../characterRegistry';
import { entityFactsService } from '../entityFactsService';
import { classifyCastForActiveStory } from './castRosterQueryService';
import { writeCastToCharacterBook } from './characterBookWriteService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockClassifyForCreation = characterRegistry.classifyForCreation as ReturnType<typeof vi.fn>;
const mockClassifyCast = classifyCastForActiveStory as ReturnType<typeof vi.fn>;
const mockExtractFacts = entityFactsService.extractAndPersistFacts as ReturnType<typeof vi.fn>;
const mockRecordPendingQuestion = characterRegistry.recordPendingQuestion as ReturnType<typeof vi.fn>;

function insertChain(row: { id: string }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
}

const USER_ID = 'user-1';
const THREAD_ID = 'thread-1';

describe('writeCastToCharacterBook', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports already_present for a member already linked and classified returning', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [
        { name: 'Ravi', entityId: 'char-ravi', classification: 'returning', confidence: 0.9, reason: 'x' },
      ],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });

    const { results, summary } = await writeCastToCharacterBook(USER_ID, 'make sure they are in my character book', THREAD_ID);

    expect(results).toEqual([
      expect.objectContaining({ name: 'Ravi', outcome: 'already_present', characterId: 'char-ravi' }),
    ]);
    expect(summary).toContain('Ravi');
    expect(mockClassifyForCreation).not.toHaveBeenCalled();
  });

  it('saves a genuinely new, confidently-named member and extracts source-linked facts', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [{ name: 'Tobias', entityId: null, classification: 'new', confidence: 0.8, reason: 'x' }],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({ action: 'create', cleanName: 'Tobias' });
    mockFrom.mockReturnValue(insertChain({ id: 'char-tobias' }));

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);

    expect(results).toEqual([
      expect.objectContaining({ name: 'Tobias', outcome: 'saved', characterId: 'char-tobias' }),
    ]);
    expect(mockExtractFacts).not.toHaveBeenCalled(); // no conversation text in this test's empty thread
  });

  it('does not create a duplicate for a merge match — already_present, no new character row', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [{ name: 'Ravi', entityId: null, classification: 'new', confidence: 0.5, reason: 'x' }],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({
      action: 'merge',
      characterId: 'char-existing',
      matchedName: 'Ravi',
      cleanName: 'Ravi',
    });

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);

    expect(results).toEqual([
      expect.objectContaining({ name: 'Ravi', outcome: 'already_present', characterId: 'char-existing' }),
    ]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('never silently saves a spelling-uncertain (unresolved) member — queues for review instead', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [
        {
          name: 'Menya',
          entityId: null,
          classification: 'unresolved',
          confidence: 0.2,
          reason: 'x',
          spellingNote: 'Menya — new, spelling uncertain',
        },
      ],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({ action: 'create', cleanName: 'Menya' });

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);

    expect(results).toEqual([
      expect.objectContaining({ name: 'Menya', outcome: 'proposed_for_review', spellingUncertain: true }),
    ]);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRecordPendingQuestion).toHaveBeenCalled();
  });

  it('reports ambiguous for a deferred/multi-candidate match, never guessing', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [{ name: 'Juan', entityId: null, classification: 'new', confidence: 0.4, reason: 'x' }],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({
      action: 'defer',
      cleanName: 'Juan',
      rawName: 'Juan',
      candidates: [{ character_id: 'a', name: 'Juan A' }, { character_id: 'b', name: 'Juan B' }],
    });

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);

    expect(results[0]).toMatchObject({ name: 'Juan', outcome: 'ambiguous' });
    expect(mockRecordPendingQuestion).toHaveBeenCalled();
  });

  it('reports failed with the resolver reason on reject, never crashes', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [{ name: 'Professor', entityId: null, classification: 'new', confidence: 0.3, reason: 'x' }],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({ action: 'reject', reason: 'bare_title_without_context' });

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);

    expect(results[0]).toMatchObject({ name: 'Professor', outcome: 'failed' });
    expect(results[0].detail).toContain('bare_title_without_context');
  });

  it('processes each cast member independently — one failure does not block the others', async () => {
    mockClassifyCast.mockResolvedValue({
      members: [
        { name: 'Ravi', entityId: 'char-ravi', classification: 'returning', confidence: 0.9, reason: 'x' },
        { name: 'Professor', entityId: null, classification: 'new', confidence: 0.3, reason: 'x' },
      ],
      storyWindowStart: '2026-06-10T00:00:00.000Z',
    });
    mockClassifyForCreation.mockResolvedValue({ action: 'reject', reason: 'bare_title_without_context' });

    const { results } = await writeCastToCharacterBook(USER_ID, 'save them all', THREAD_ID);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.name === 'Ravi')?.outcome).toBe('already_present');
    expect(results.find((r) => r.name === 'Professor')?.outcome).toBe('failed');
  });
});
