import { describe, expect, it } from 'vitest';

import {
  countMissingAssistantTurns,
  hasOrderingConflict,
  dedupeMessages,
  type DurableMessage,
} from '../../src/services/conversationCentered/threadDurabilityChecks';
import { deriveTitleFromMessages, isGenericThreadTitle } from '../../src/utils/threadTitleUtils';

const m = (id: string, role: string, content: string, t: string): DurableMessage => ({ id, role, content, created_at: t });
const T = (s: number) => new Date(2026, 0, 1, 0, 0, s).toISOString();

describe('Thread durability — missing assistant detection (refresh/tab-close/OpenAI failure)', () => {
  it('user-only thread (assistant never persisted) → 1 missing turn', () => {
    expect(countMissingAssistantTurns([{ role: 'user' }])).toBe(1);
  });
  it('user + (even partial) assistant → 0 missing — the durable-persist fix', () => {
    expect(countMissingAssistantTurns([{ role: 'user' }, { role: 'assistant' }])).toBe(0);
  });
  it('two user turns, only first answered → 1 missing', () => {
    expect(countMissingAssistantTurns([
      { role: 'user' }, { role: 'assistant' }, { role: 'user' },
    ])).toBe(1);
  });
  it('fully answered multi-turn → 0 missing', () => {
    expect(countMissingAssistantTurns([
      { role: 'user' }, { role: 'assistant' }, { role: 'user' }, { role: 'assistant' },
    ])).toBe(0);
  });
});

describe('Thread durability — duplicate send / multiple tabs / slow hydration', () => {
  it('duplicate send (optimistic + server copy) collapses to one', () => {
    const merged = dedupeMessages([
      [m('user-123', 'user', 'hey there', T(1))],   // optimistic client row
      [m('db-1', 'user', 'hey there', T(1))],        // server canonical row
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('db-1'); // real DB row wins over synthetic
  });

  it('multiple tabs / partial sources merge to the complete conversation', () => {
    // Tab A hydrated only the user msg; Tab B / snapshot had the assistant.
    const merged = dedupeMessages([
      [m('db-1', 'user', 'what happened with Alex', T(1))],
      [m('db-2', 'assistant', 'Here is what I recall…', T(2))],
      [m('meta-1', 'user', 'what happened with Alex', T(1))], // snapshot dup
    ]);
    expect(merged.map((x) => x.role)).toEqual(['user', 'assistant']);
    expect(merged).toHaveLength(2); // snapshot dup removed
  });

  it('slow hydration: chat_messages canonical + empty ingestion → still complete', () => {
    const merged = dedupeMessages([
      [], // conversation_messages (ingestion) lagging/empty
      [m('db-1', 'user', 'hi', T(1)), m('db-2', 'assistant', 'hello', T(2))], // chat_messages
    ]);
    expect(merged).toHaveLength(2);
  });

  it('empty/whitespace messages are never surfaced', () => {
    expect(dedupeMessages([[m('db-1', 'assistant', '   ', T(1))]])).toHaveLength(0);
  });
});

describe('Thread durability — ordering (thread switch / new activity reconciliation)', () => {
  it('stale updated_at (older than last message) → ordering conflict', () => {
    expect(hasOrderingConflict(T(1), T(50))).toBe(true);
  });
  it('updated_at at/after last message → no conflict (opening a thread must not reorder)', () => {
    expect(hasOrderingConflict(T(50), T(50))).toBe(false);
    expect(hasOrderingConflict(T(51), T(50))).toBe(false);
  });
  it('merged messages are chronological, user-before-assistant on ties', () => {
    const merged = dedupeMessages([
      [m('db-2', 'assistant', 'reply', T(5))],
      [m('db-1', 'user', 'question', T(5))],
    ]);
    expect(merged.map((x) => x.role)).toEqual(['user', 'assistant']);
  });
});

describe('Thread durability — broken-title repair (Phase 6/7: never "New Conversation")', () => {
  it('derives a real title from the first user message', () => {
    const title = deriveTitleFromMessages([
      { role: 'user', content: 'Took Grandma Rose to Costco yesterday and it took forever' },
      { role: 'assistant', content: 'That sounds like a long trip…' },
    ]);
    expect(title).toBeTruthy();
    expect(isGenericThreadTitle(title)).toBe(false);
  });

  it('a thread with messages never keeps a generic title after repair', () => {
    for (const generic of ['New Chat', 'Untitled', 'Chat', 'Draft', '']) {
      expect(isGenericThreadTitle(generic)).toBe(true); // detected as broken
    }
    const repaired = deriveTitleFromMessages([{ role: 'user', content: 'LifeLedger memory testing session' }]);
    expect(isGenericThreadTitle(repaired)).toBe(false);
  });

  it('returns null when there is no user message to derive from (no false title)', () => {
    expect(deriveTitleFromMessages([{ role: 'assistant', content: 'hello' }])).toBeNull();
  });
});

describe('Thread durability — network interruption (partial assistant survives)', () => {
  it('a partial assistant message is a real, counted reply (not a missing turn)', () => {
    // After a mid-stream abort, the route persists the partial assistant content.
    const seq = [{ role: 'user' }, { role: 'assistant' }]; // partial still has role 'assistant'
    expect(countMissingAssistantTurns(seq)).toBe(0);
    const merged = dedupeMessages([[
      m('db-1', 'user', 'tell me a story', T(1)),
      m('db-2', 'assistant', 'Once upon a time the connection drop', T(2)), // partial
    ]]);
    expect(merged).toHaveLength(2);
  });
});
