import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../conversationCentered/threadContentService', () => ({
  loadThreadMessages: vi.fn(),
}));

vi.mock('../conversationCentered/threadRosterService', () => ({
  threadRosterService: { getRoster: vi.fn() },
}));

import { supabaseAdmin } from '../supabaseClient';
import { loadThreadMessages } from '../conversationCentered/threadContentService';
import { threadRosterService } from '../conversationCentered/threadRosterService';
import { classifyCastForActiveStory } from './castRosterQueryService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockLoadThreadMessages = loadThreadMessages as ReturnType<typeof vi.fn>;
const mockGetRoster = threadRosterService.getRoster as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

const USER_A = 'user-a-11111111-1111-1111-1111-111111111111';
const USER_B = 'user-b-22222222-2222-2222-2222-222222222222';
const SESSION_ID = 'session-1';
const STORY_WINDOW_START = '2026-06-10T00:00:00.000Z';

function rosterEntry(overrides: Partial<any> = {}) {
  return {
    entityId: null,
    name: 'Ravi',
    kind: 'character',
    actorType: 'PERSON',
    role: 'mentioned',
    status: 'active',
    source: 'auto',
    mentions: 1,
    firstSeenRef: '1.1',
    lastSeenRef: '1.1',
    pinned: false,
    ...overrides,
  };
}

describe('classifyCastForActiveStory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadThreadMessages.mockResolvedValue([
      { id: 'm1', role: 'user', content: 'hey', created_at: STORY_WINDOW_START },
    ]);
  });

  it('scopes the story window strictly to the given session (loadThreadMessages call args)', async () => {
    mockGetRoster.mockResolvedValue({ threadNumber: 1, entries: [] });
    await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(mockLoadThreadMessages).toHaveBeenCalledWith(USER_A, SESSION_ID);
    expect(mockGetRoster).toHaveBeenCalledWith(USER_A, SESSION_ID);
  });

  it('classifies a linked entity with an earlier cross-session first_linked_at as returning', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: 'char-1', name: 'Ravi' })],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'entity_conversation_links') {
        return chain([{ entity_id: 'char-1', first_linked_at: '2026-01-01T00:00:00.000Z' }]);
      }
      return chain([]);
    });

    const { members, storyWindowStart } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(storyWindowStart).toBe(STORY_WINDOW_START);
    expect(members).toEqual([
      expect.objectContaining({ name: 'Ravi', entityId: 'char-1', classification: 'returning' }),
    ]);
  });

  it('classifies a linked entity whose only link is inside this window as new', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: 'char-2', name: 'Tobias' })],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'entity_conversation_links') {
        return chain([{ entity_id: 'char-2', first_linked_at: '2026-06-10T00:05:00.000Z' }]);
      }
      return chain([]);
    });

    const { members } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(members).toEqual([
      expect.objectContaining({ name: 'Tobias', entityId: 'char-2', classification: 'new' }),
    ]);
  });

  it('resolves a name-only mention against the Character Book and classifies by first_linked_at', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: null, name: 'Ravi' })],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([{ id: 'char-1', name: 'Ravi', alias: [], metadata: {} }]);
      }
      if (table === 'entity_conversation_links') {
        return chain([{ entity_id: 'char-1', first_linked_at: '2026-01-01T00:00:00.000Z' }]);
      }
      return chain([]);
    });

    const { members } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(members[0]).toMatchObject({ name: 'Ravi', entityId: 'char-1', classification: 'returning' });
  });

  it('classifies a name with no Character Book match as new', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: null, name: 'Wrenlow' })],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') return chain([]);
      return chain([]);
    });

    const { members } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(members[0]).toMatchObject({ name: 'Wrenlow', classification: 'new', entityId: null });
  });

  it('marks a recurring but never cleanly resolved (ANONYMOUS_PERSON) mention as unresolved with a spelling note', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: null, name: 'Menya', actorType: 'ANONYMOUS_PERSON' })],
    });
    mockFrom.mockImplementation(() => chain([]));

    const { members } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(members[0].classification).toBe('unresolved');
    expect(members[0].spellingNote).toContain('spelling uncertain');
  });

  it('excludes roster entries the user marked excluded', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [
        rosterEntry({ entityId: 'char-3', name: 'Jamie', status: 'excluded' }),
      ],
    });
    const { members } = await classifyCastForActiveStory(USER_A, SESSION_ID);
    expect(members).toEqual([]);
  });

  it('scopes character-book lookup by user_id — two users with an identically named character do not cross-resolve', async () => {
    mockGetRoster.mockResolvedValue({
      threadNumber: 1,
      entries: [rosterEntry({ entityId: null, name: 'Tobias' })],
    });
    const capturedUserIdArgs: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      const c = chain([]);
      if (table === 'characters') {
        c.eq = vi.fn((col: string, val: string) => {
          if (col === 'user_id') capturedUserIdArgs.push(val);
          return c;
        });
      }
      return c;
    });

    await classifyCastForActiveStory(USER_B, SESSION_ID);
    expect(capturedUserIdArgs).toEqual([USER_B]);
    expect(capturedUserIdArgs).not.toContain(USER_A);
  });
});
