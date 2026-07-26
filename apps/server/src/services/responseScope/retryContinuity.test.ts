import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../supabaseClient';
import { loadLastResolvedTurnState } from './retryContinuity';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return obj;
}

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

describe('loadLastResolvedTurnState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replays a failed CURRENT_STORY_CAST turn from its persisted metadata', async () => {
    mockFrom.mockReturnValue(
      chain({
        metadata: {
          resolvedTurnState: {
            mode: 'CURRENT_STORY_CAST',
            scopeIntent: 'general',
            scopeSource: 'message',
            entities: [],
            threadId: SESSION_ID,
            responseMode: 'SILENCE',
            originalMessageText: "who's new and returning in this story, like the people/characters?",
          },
        },
      }),
    );

    const state = await loadLastResolvedTurnState(USER_ID, SESSION_ID);
    expect(state).toEqual(
      expect.objectContaining({
        mode: 'CURRENT_STORY_CAST',
        originalMessageText: "who's new and returning in this story, like the people/characters?",
      }),
    );
  });

  it('generalizes across mode types — also replays a failed SUBJECT_TIMELINE turn', async () => {
    mockFrom.mockReturnValue(
      chain({
        metadata: {
          resolvedTurnState: {
            mode: 'SUBJECT_TIMELINE',
            originalMessageText: 'show me my timeline with Wrenlow',
          },
        },
      }),
    );

    const state = await loadLastResolvedTurnState(USER_ID, SESSION_ID);
    expect(state?.mode).toBe('SUBJECT_TIMELINE');
    expect(state?.originalMessageText).toBe('show me my timeline with Wrenlow');
  });

  it('returns null when no prior resolved turn state was persisted', async () => {
    mockFrom.mockReturnValue(chain({ metadata: {} }));
    const state = await loadLastResolvedTurnState(USER_ID, SESSION_ID);
    expect(state).toBeNull();
  });

  it('returns null when the last assistant message lookup errors', async () => {
    mockFrom.mockReturnValue(chain(null, new Error('db unavailable')));
    const state = await loadLastResolvedTurnState(USER_ID, SESSION_ID);
    expect(state).toBeNull();
  });

  it('scopes the lookup to the given user and session', async () => {
    const c = chain({ metadata: {} });
    mockFrom.mockReturnValue(c);
    await loadLastResolvedTurnState(USER_ID, SESSION_ID);
    expect(c.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(c.eq).toHaveBeenCalledWith('session_id', SESSION_ID);
    expect(c.eq).toHaveBeenCalledWith('role', 'assistant');
  });
});
