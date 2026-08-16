import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; method: string; args: unknown[] };

type TestState = {
  sessionExists: boolean;
  existingLink: { id: string; mention_count: number; link_kind: string } | null;
  calls: Call[];
};

let state: TestState;

class MockQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(
    private table: string,
    private state: TestState
  ) {}

  private log(method: string, args: unknown[]) {
    this.state.calls.push({ table: this.table, method, args });
  }

  select(...args: unknown[]) {
    this.log('select', args);
    return this;
  }
  eq(...args: unknown[]) {
    this.log('eq', args);
    return this;
  }
  is(...args: unknown[]) {
    this.log('is', args);
    return this;
  }
  order(...args: unknown[]) {
    this.log('order', args);
    return this;
  }
  limit(...args: unknown[]) {
    this.log('limit', args);
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.log('update', [payload]);
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.log('insert', [payload]);
    return this;
  }
  maybeSingle() {
    this.log('maybeSingle', []);
    if (this.table === 'conversation_sessions') {
      return Promise.resolve({
        data: this.state.sessionExists ? { id: 'session-under-test' } : null,
        error: null,
      });
    }
    if (this.table === 'entity_conversation_links') {
      return Promise.resolve({ data: this.state.existingLink, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => new MockQuery(table, state)),
  },
}));

import { entityConversationLinkService } from '../../src/services/conversationCentered/entityConversationLinkService';

const USER_ID = 'user-1';
const SESSION_ID = 'session-under-test';

describe('entityConversationLinkService.applyChatFocusOriginLink', () => {
  beforeEach(() => {
    state = { sessionExists: true, existingLink: null, calls: [] };
  });

  it('sets primary_entity_type/id and records an origin link for an organization focus', async () => {
    await entityConversationLinkService.applyChatFocusOriginLink(USER_ID, SESSION_ID, {
      entityId: 'org-1',
      entityName: 'Acme Corp',
      entityType: 'organization',
    });

    const linkInsert = state.calls.find(
      (c) => c.table === 'entity_conversation_links' && c.method === 'insert'
    );
    expect(linkInsert).toBeTruthy();
    expect(linkInsert!.args[0]).toMatchObject({
      entity_type: 'organization',
      entity_id: 'org-1',
      link_kind: 'origin',
    });

    const sessionUpdate = state.calls.find(
      (c) => c.table === 'conversation_sessions' && c.method === 'update'
    );
    expect(sessionUpdate).toBeTruthy();
    expect(sessionUpdate!.args[0]).toMatchObject({
      primary_entity_type: 'organization',
      primary_entity_id: 'org-1',
    });
  });

  it('sets primary_entity_type/id for a location focus', async () => {
    await entityConversationLinkService.applyChatFocusOriginLink(USER_ID, SESSION_ID, {
      entityId: 'loc-1',
      entityName: 'The Old Pier',
      entityType: 'location',
    });

    const sessionUpdate = state.calls.find(
      (c) => c.table === 'conversation_sessions' && c.method === 'update'
    );
    expect(sessionUpdate!.args[0]).toMatchObject({
      primary_entity_type: 'location',
      primary_entity_id: 'loc-1',
    });
  });

  it.each(['project', 'skill', 'relationship', 'quest', 'event', 'memory', 'perception'])(
    'no-ops for unsupported focus entity type %s',
    async (entityType) => {
      await entityConversationLinkService.applyChatFocusOriginLink(USER_ID, SESSION_ID, {
        entityId: 'x-1',
        entityName: 'Whatever',
        entityType,
      });

      expect(state.calls).toHaveLength(0);
    }
  );

  it('always guards the primary-entity UPDATE with primary_entity_id IS NULL (first-write-wins enforced at the DB layer)', async () => {
    await entityConversationLinkService.applyChatFocusOriginLink(USER_ID, SESSION_ID, {
      entityId: 'char-1',
      entityName: 'V',
      entityType: 'character',
    });

    const guardCall = state.calls.find(
      (c) =>
        c.table === 'conversation_sessions' &&
        c.method === 'is' &&
        c.args[0] === 'primary_entity_id' &&
        c.args[1] === null
    );
    expect(guardCall).toBeTruthy();
  });

  it('increments mention_count and keeps link_kind origin on a repeat call for the same entity', async () => {
    state.existingLink = { id: 'link-1', mention_count: 2, link_kind: 'origin' };

    await entityConversationLinkService.applyChatFocusOriginLink(USER_ID, SESSION_ID, {
      entityId: 'org-1',
      entityName: 'Acme Corp',
      entityType: 'organization',
    });

    const linkUpdate = state.calls.find(
      (c) => c.table === 'entity_conversation_links' && c.method === 'update'
    );
    expect(linkUpdate).toBeTruthy();
    expect(linkUpdate!.args[0]).toMatchObject({ mention_count: 3 });
  });
});
