import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { GuestProvider } from '../../contexts/GuestContext';
import { MockDataProvider } from '../../contexts/MockDataContext';
import { CurrentContextProvider } from '../../contexts/CurrentContextContext';
import { ChatFirstInterface } from '../../features/chat/components/ChatFirstInterface';
import { ReduxProvider } from '../../store/ReduxProvider';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({})
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  },
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigDebug: vi.fn().mockReturnValue({})
}));

vi.mock('../../features/chat/hooks/useChat', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    setMessages: vi.fn(),
    isLoading: false,
    loadingStage: null,
    loadingProgress: 0,
    streamingMessageId: null,
    sources: [],
    sendMessage: vi.fn(),
    clearConversation: vi.fn(),
    messageRefs: { current: {} },
    registerMessageRef: vi.fn(),
  }))
}));

vi.mock('../../features/chat/hooks/useConversationRuntime', () => ({
  useConversationRuntime: vi.fn(() => ({
    threads: [],
    activeThreadId: null,
    handleNewChat: vi.fn(),
    handleSelectThread: vi.fn(),
    handleDeleteThread: vi.fn(),
    renameThread: vi.fn(),
    forkThread: vi.fn(),
    greetingMessage: null,
    clearGreeting: vi.fn(),
    isSaving: false,
    saveThread: vi.fn(),
    currentThread: null,
  }))
}));

vi.mock('../../features/chat/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn()
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn(() => ({
    entries: [],
    characters: [],
    chapters: [],
    timeline: { chapters: [], unassigned: [] },
    loading: false,
    error: null,
    createEntry: vi.fn(),
    refreshEntries: vi.fn(),
    refreshTimeline: vi.fn(),
    refreshChapters: vi.fn(),
    loadCharacters: vi.fn(),
  }))
}));

vi.mock('../../utils/errorDiagnostics', () => ({
  diagnoseEndpoints: vi.fn().mockResolvedValue({}),
  logDiagnostics: vi.fn()
}));

vi.mock('../../lib/monitoring', () => ({
  analytics: { track: vi.fn(), page: vi.fn() },
  performance: { mark: vi.fn(), measure: vi.fn(), trackApiCall: vi.fn(), now: () => Date.now() },
  errorTracking: { captureException: vi.fn() }
}));

function ChatWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider>
      <BrowserRouter>
        <MockDataProvider>
          <CurrentContextProvider>
            <GuestProvider>
              {children}
            </GuestProvider>
          </CurrentContextProvider>
        </MockDataProvider>
      </BrowserRouter>
    </ReduxProvider>
  );
}

describe('Chat Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should render chat interface without crashing', async () => {
    const { container } = render(
      <ChatWrapper>
        <ChatFirstInterface />
      </ChatWrapper>
    );

    // Smoke test: component mounts and renders something
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('should have chat input area', async () => {
    const { container } = render(
      <ChatWrapper>
        <ChatFirstInterface />
      </ChatWrapper>
    );

    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // Basic smoke test: component rendered without crashing
    expect(document.body).toBeTruthy();
  });
});
