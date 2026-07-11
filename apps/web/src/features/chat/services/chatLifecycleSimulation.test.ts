import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../message/ChatMessage';
import type { ChatThread } from '../hooks/useChatThreads';
import {
  CHAT_LIFECYCLE_SCENARIOS,
  runChatLifecycleScenario,
  type ChatLifecycleAdapter,
} from './chatLifecycleSimulation';

function createMockAdapter(initialThreads: ChatThread[] = []): ChatLifecycleAdapter & {
  threads: ChatThread[];
  activeId: string | null;
  messagesByThread: Map<string, Message[]>;
} {
  const state = {
    threads: [...initialThreads],
    activeId: initialThreads[0]?.id ?? null,
    messagesByThread: new Map<string, Message[]>(
      initialThreads.map((t) => [t.id, [...t.messages]])
    ),
  };

  return {
    ...state,
    createThread: () => {
      const id = `thread-${state.threads.length + 1}`;
      const thread: ChatThread = {
        id,
        title: 'New chat',
        messages: [],
        updatedAt: new Date().toISOString(),
      };
      state.threads.unshift(thread);
      state.messagesByThread.set(id, []);
      state.activeId = id;
      return id;
    },
    selectThread: (threadId) => {
      state.activeId = threadId;
    },
    getActiveThreadId: () => state.activeId,
    getThreads: () => state.threads,
    appendMessage: (threadId, message, opts) => {
      const list = state.messagesByThread.get(threadId) ?? [];
      state.messagesByThread.set(threadId, [...list, message]);
      const idx = state.threads.findIndex((t) => t.id === threadId);
      if (idx >= 0) {
        state.threads[idx] = {
          ...state.threads[idx],
          messages: state.messagesByThread.get(threadId) ?? [],
          updatedAt: opts?.touchActivity ? new Date().toISOString() : state.threads[idx].updatedAt,
        };
        if (opts?.touchActivity) {
          const [t] = state.threads.splice(idx, 1);
          state.threads.unshift(t);
        }
      }
    },
    updateMessage: (threadId, messageId, updates) => {
      const list = state.messagesByThread.get(threadId) ?? [];
      state.messagesByThread.set(
        threadId,
        list.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
      );
    },
    updateThread: (threadId, updates) => {
      const idx = state.threads.findIndex((t) => t.id === threadId);
      if (idx < 0) return;
      const { touchActivity, ...meta } = updates;
      state.threads[idx] = { ...state.threads[idx], ...meta };
      if (touchActivity) {
        const [t] = state.threads.splice(idx, 1);
        state.threads.unshift({ ...t, updatedAt: new Date().toISOString() });
      }
    },
    navigateToThread: vi.fn(),
    onLoadingStage: vi.fn(),
  };
}

describe('chatLifecycleSimulation', () => {
  it('includes multi-turn party, romance, and conflict showcase journeys', () => {
    const showcaseIds = ['party-story', 'romantic-interest', 'conflict-repair'];

    for (const id of showcaseIds) {
      const scenario = CHAT_LIFECYCLE_SCENARIOS.find((candidate) => candidate.id === id);
      expect(scenario, `${id} scenario`).toBeDefined();
      expect(scenario?.steps.filter((step) => step.type === 'userMessage')).toHaveLength(3);
      expect(scenario?.steps.filter((step) => step.type === 'assistantStream')).toHaveLength(3);
    }
  });

  it('showcase replies cover structured chatbot capabilities', () => {
    const showcaseSteps = CHAT_LIFECYCLE_SCENARIOS
      .filter((scenario) => ['party-story', 'romantic-interest', 'conflict-repair'].includes(scenario.id))
      .flatMap((scenario) => scenario.steps)
      .filter((step) => step.type === 'assistantStream');
    const results = showcaseSteps.map((step) => step.result ?? {});

    expect(results.some((result) => result.mentionedEntities?.length)).toBe(true);
    expect(results.some((result) => result.timelineUpdates?.length)).toBe(true);
    expect(results.some((result) => result.creationOutcomes?.length)).toBe(true);
    expect(results.some((result) => result.sources?.length || result.citations?.length)).toBe(true);
    expect(results.some((result) => result.continuityWarnings?.length)).toBe(true);
    expect(results.some((result) => result.staleProjectionHints?.length)).toBe(true);
    expect(results.some((result) => result.suggestedActions?.length)).toBe(true);
    expect(results.some((result) => result.strategicGuidance)).toBe(true);
    expect(results.some((result) => result.response_mode === 'RECALL')).toBe(true);
  });

  it('creates a thread and appends a user message', async () => {
    const adapter = createMockAdapter();
    const scenario = CHAT_LIFECYCLE_SCENARIOS.find((s) => s.id === 'live-reply')!;

    await runChatLifecycleScenario(adapter, scenario, {
      signal: AbortSignal.timeout(15_000),
    });

    expect(adapter.threads.length).toBeGreaterThan(0);
    const activeId = adapter.getActiveThreadId();
    expect(activeId).toBeTruthy();
    const messages = adapter.messagesByThread.get(activeId!) ?? [];
    expect(messages.some((m) => m.role === 'user')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant' && !m.isStreaming)).toBe(true);
    expect(adapter.navigateToThread).toHaveBeenCalled();
  });

  it('bumps an older thread when touchActivity is used', async () => {
    const adapter = createMockAdapter([
      { id: 't1', title: 'Latest', messages: [], updatedAt: new Date().toISOString() },
      { id: 't2', title: 'Older', messages: [], updatedAt: new Date(Date.now() - 86_400_000).toISOString() },
    ]);
    adapter.activeId = 't1';

    const scenario = CHAT_LIFECYCLE_SCENARIOS.find((s) => s.id === 'thread-bump')!;
    await runChatLifecycleScenario(adapter, scenario, {
      signal: AbortSignal.timeout(15_000),
    });

    expect(adapter.threads[0]?.id).toBe('t2');
  });
});
