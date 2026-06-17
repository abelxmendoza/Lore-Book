import { describe, expect, it, vi, beforeEach } from 'vitest';

import { backfillMentionedEntitiesForUser } from './entityMentionBackfillService';

const mockResolve = vi.fn();

vi.mock('./messageEntityDisplayService', () => ({
  resolveMessageEntitiesForDisplay: (...args: unknown[]) => mockResolve(...args),
}));

type AssistantRow = {
  id: string;
  session_id: string;
  content: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type UserRow = {
  session_id: string;
  content: string | null;
  created_at: string;
};

let assistantRows: AssistantRow[] = [];
let userRows: UserRow[] = [];
const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];

function chainTerminal(data: unknown) {
  return {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    select: vi.fn().mockReturnThis(),
    update: vi.fn((payload: { metadata: Record<string, unknown> }) => ({
      eq: vi.fn().mockImplementation((_col: string, id: string) => ({
        eq: vi.fn().mockResolvedValue(({ error: null })),
        then: undefined,
        // capture update by chaining second eq for user_id
      })),
    })),
  };
}

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'chat_messages') {
        return chainTerminal([]);
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, value: string) => {
            const chain = {
              eq: vi.fn().mockImplementation((_col2: string, role: string) => ({
                order: vi.fn().mockImplementation(async () => {
                  if (role === 'assistant') {
                    return { data: assistantRows, error: null };
                  }
                  return { data: userRows, error: null };
                }),
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: userRows, error: null }),
                }),
              })),
              in: vi.fn().mockImplementation(async () => ({ data: userRows, error: null })),
              order: vi.fn().mockResolvedValue({ data: assistantRows, error: null }),
            };
            return chain;
          }),
        }),
        update: vi.fn((payload: { metadata: Record<string, unknown> }) => ({
          eq: vi.fn().mockImplementation((_col: string, id: string) => ({
            eq: vi.fn().mockImplementation(async () => {
              updates.push({ id, metadata: payload.metadata });
              return { error: null };
            }),
          })),
        })),
      };
    }),
  },
}));

describe('backfillMentionedEntitiesForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantRows = [];
    userRows = [];
    updates.length = 0;
    mockResolve.mockReset();
  });

  it('skips assistants that already have mentionedEntities', async () => {
    assistantRows = [
      {
        id: 'a1',
        session_id: 's1',
        content: 'Reply',
        created_at: '2026-06-01T00:00:01Z',
        metadata: {
          mentionedEntities: [{ id: 'c1', name: 'Maria', type: 'character' }],
        },
      },
    ];

    const count = await backfillMentionedEntitiesForUser('user-1');
    expect(count).toBe(0);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('backfills mentionedEntities from the preceding user turn', async () => {
    assistantRows = [
      {
        id: 'a1',
        session_id: 's1',
        content: 'That sounds meaningful.',
        created_at: '2026-06-01T00:00:01Z',
        metadata: { saved_from_stream: true },
      },
    ];
    userRows = [
      {
        session_id: 's1',
        content: 'I visited Tía Maria in San Diego.',
        created_at: '2026-06-01T00:00:00Z',
      },
    ];
    mockResolve.mockResolvedValue([
      { id: 'c1', name: 'Tía Maria', type: 'character', confidence: 1, provenance: 'character_book' },
      { id: 'l1', name: 'San Diego', type: 'location', confidence: 1, provenance: 'location_book' },
    ]);

    const count = await backfillMentionedEntitiesForUser('user-1');

    expect(count).toBe(1);
    expect(mockResolve).toHaveBeenCalledWith('user-1', 'I visited Tía Maria in San Diego.');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('a1');
    expect(updates[0].metadata.mentionedEntities).toEqual([
      { id: 'c1', name: 'Tía Maria', type: 'character', confidence: 1, provenance: 'character_book' },
      { id: 'l1', name: 'San Diego', type: 'location', confidence: 1, provenance: 'location_book' },
    ]);
    expect(updates[0].metadata.entity_backfill_at).toBeTruthy();
  });

  it('marks entity_backfill_at even when no entities are detected', async () => {
    assistantRows = [
      {
        id: 'a2',
        session_id: 's2',
        content: 'Hello.',
        created_at: '2026-06-01T00:00:01Z',
        metadata: {},
      },
    ];
    userRows = [
      {
        session_id: 's2',
        content: 'Just saying hi.',
        created_at: '2026-06-01T00:00:00Z',
      },
    ];
    mockResolve.mockResolvedValue([]);

    const count = await backfillMentionedEntitiesForUser('user-1');

    expect(count).toBe(1);
    expect(updates[0].metadata.entity_backfill_at).toBeTruthy();
    expect(updates[0].metadata.mentionedEntities).toBeUndefined();
  });
});
