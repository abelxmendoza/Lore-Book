import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserts: Record<string, unknown>[] = [];
const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
let updateShouldFail = false;
let insertShouldFail = false;

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.select = vi.fn().mockReturnValue(chain);

      if (table === 'chat_messages') {
        chain.insert = vi.fn((payload: Record<string, unknown>) => {
          inserts.push(payload);
          if (insertShouldFail) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: { message: 'insert failed' } }),
              }),
            };
          }
          return {
            select: () => ({
              single: async () => ({ data: { id: 'asst-new-1' }, error: null }),
            }),
          };
        });
        chain.update = vi.fn((payload: Record<string, unknown>) => {
          updates.push({ id: 'tracked', payload });
          return {
            eq: () => ({
              eq: async () => ({ error: updateShouldFail ? { message: 'update failed' } : null }),
            }),
          };
        });
        chain.delete = vi.fn().mockReturnValue({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        });
      }

      if (table === 'conversation_sessions') {
        chain.update = vi.fn().mockReturnValue({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        });
      }

      return chain;
    }),
  },
}));

import {
  insertAssistantPlaceholder,
  finalizeAssistantMessage,
  userPersistResult,
  deleteAssistantPlaceholder,
} from './chatMessagePersistenceService';

describe('chatMessagePersistenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    updates.length = 0;
    updateShouldFail = false;
    insertShouldFail = false;
  });

  it('insertAssistantPlaceholder returns id on success', async () => {
    const result = await insertAssistantPlaceholder('user-1', 'session-1');
    expect(result.saved).toBe(true);
    expect(result.id).toBe('asst-new-1');
    expect(inserts[0]).toMatchObject({ role: 'assistant', session_id: 'session-1' });
  });

  it('insertAssistantPlaceholder returns error when insert fails', async () => {
    insertShouldFail = true;
    const result = await insertAssistantPlaceholder('user-1', 'session-1');
    expect(result.saved).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('finalizeAssistantMessage updates placeholder with content', async () => {
    const result = await finalizeAssistantMessage({
      userId: 'user-1',
      sessionId: 'session-1',
      assistantRowId: 'asst-ph-1',
      content: 'Hello world',
      metadata: { mentionedEntities: [] },
      status: 'complete',
    });
    expect(result.saved).toBe(true);
    expect(updates[0].payload.content).toBe('Hello world');
    expect(updates[0].payload.metadata).toMatchObject({ stream_status: 'complete' });
  });

  it('finalizeAssistantMessage reports error when update fails', async () => {
    updateShouldFail = true;
    const result = await finalizeAssistantMessage({
      userId: 'user-1',
      sessionId: 'session-1',
      assistantRowId: 'asst-ph-1',
      content: 'Partial',
      metadata: {},
      status: 'partial',
    });
    expect(result.saved).toBe(false);
    expect(result.error).toContain('update failed');
  });

  it('finalizeAssistantMessage skips empty content and deletes placeholder', async () => {
    const result = await finalizeAssistantMessage({
      userId: 'user-1',
      sessionId: 'session-1',
      assistantRowId: 'asst-ph-empty',
      content: '   ',
      metadata: {},
      status: 'complete',
    });
    expect(result.saved).toBe(false);
    expect(result.error).toBe('empty_content');
    expect(updates).toHaveLength(0);
  });

  it('userPersistResult reflects message id presence', () => {
    expect(userPersistResult('user-db-1')).toEqual({
      saved: true,
      id: 'user-db-1',
      role: 'user',
    });
    expect(userPersistResult(undefined).saved).toBe(false);
  });

  it('deleteAssistantPlaceholder does not throw', async () => {
    await expect(deleteAssistantPlaceholder('user-1', 'asst-1')).resolves.toBeUndefined();
  });
});
