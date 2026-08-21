import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';

import { makeStore } from '../../../store';
import { MockDataProvider } from '../../../contexts/MockDataContext';
import { GuestProvider } from '../../../contexts/GuestContext';
import { ChatComposer } from './ChatComposer';
import { useChatComposer } from '../hooks/useChatComposer';
import { resetEntityIndexerCache } from '../../../hooks/useEntityIndexer';
import { clearLexicalPreviewSharedCache } from '../../../lib/lexicalPreviewCache';
import { clearLoreBookParseSharedCache } from '../../../lib/loreBookParseCache';
import {
  composerIntelligenceMetrics,
  COMPOSER_LIGHTWEIGHT_PREVIEW_MS,
  COMPOSER_STORAGE_DEBOUNCE_MS,
} from '../../../lib/composerIntelligence';
import { selectComposerHasDraft } from '../../../store/selectors/composerSelectors';
import { useAppSelector } from '../../../store/hooks';
import { resetStorySafetyVaultForTests } from '../services/storySafetyVault';

const fetchJson = vi.fn();

vi.mock('../../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../../../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
}));

vi.mock('../../../lib/supabase', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-sim-1' },
    session: { access_token: 't' },
    loading: false,
  })),
  isSupabaseConfigured: vi.fn(() => true),
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 't' } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('../../../hooks/useShouldUseMockData', async (orig) => ({
  ...(await orig<typeof import('../../../hooks/useShouldUseMockData')>()),
  shouldUseMockData: () => false,
}));

vi.mock('../../../hooks/useMoodEngine', () => ({
  useMoodEngine: () => ({
    mood: { score: 0, label: 'neutral', color: '#888' },
    setScore: vi.fn(),
  }),
  localHeuristic: () => 0,
}));

vi.mock('../../../hooks/useAutoTagger', () => ({
  useAutoTagger: () => ({ suggestions: [], refreshSuggestions: vi.fn() }),
}));

const LARGE_INDEX_SIZE = 400;
const DUMP_CHARS = 1000;
const LONG_THREAD = Array.from({ length: 40 }, (_, i) => ({
  id: `msg-${i}`,
  content: `Thread turn ${i}: Maya and Priya talked after the show.`,
}));

const DUMP = `${'Maya met Priya after the Vanguard Robotics show. '.repeat(40)}`.slice(0, DUMP_CHARS);

function buildIndex() {
  return Array.from({ length: LARGE_INDEX_SIZE }, (_, i) => ({
    id: `ent-${i}`,
    name: i === 0 ? 'Maya' : `Person${i}`,
    type: 'character' as const,
    aliases: i % 7 === 0 ? [`Alias${i}`] : [],
    mentionKeys: i === 0 ? ['maya'] : [`person${i}`],
    status: 'confirmed' as const,
  }));
}

function TranscriptStub() {
  composerIntelligenceMetrics.noteTranscriptRender();
  return (
    <div data-testid="transcript-stub">
      {LONG_THREAD.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
    </div>
  );
}

function Shell() {
  const hasDraft = useAppSelector(selectComposerHasDraft);
  return (
    <div data-testid="mobile-shell" style={{ width: 390, height: 844 }}>
      <TranscriptStub />
      <ChatComposer
        onSubmit={vi.fn()}
        loading={false}
        threadId="11111111-1111-4111-8111-111111111111"
      />
      <span data-testid="has-draft">{String(hasDraft)}</span>
    </div>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <Provider store={makeStore()}>
        <MockDataProvider>
          <GuestProvider>{children}</GuestProvider>
        </MockDataProvider>
      </Provider>
    </MemoryRouter>
  );
}

describe('composer intelligence — bounded keystroke work', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityIndexerCache();
    clearLexicalPreviewSharedCache();
    clearLoreBookParseSharedCache();
    resetStorySafetyVaultForTests();
    composerIntelligenceMetrics.reset();
    fetchJson.mockImplementation((url: string) => {
      if (String(url).includes('/api/entities/certified-index')) {
        return Promise.resolve({ entities: buildIndex() });
      }
      if (String(url).includes('/api/lexical/preview')) {
        return Promise.resolve({ spans: [], inferredAssociations: [], ambiguities: [] });
      }
      if (String(url).includes('lorebook-parse')) {
        return Promise.resolve({
          operations: [],
          redirects: [],
          suppressed: [],
          warnings: [],
          lexicalSpanCount: 0,
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not reconstruct canon or scan the entity index on every keystroke of a 1k lore dump', async () => {
    const { result } = renderHook(() => useChatComposer(vi.fn(), null, { threadId: 'thread-sim' }), {
      wrapper: Providers,
    });

    await waitFor(() => {
      expect(fetchJson.mock.calls.some((call) => String(call[0]).includes('certified-index'))).toBe(true);
    });

    composerIntelligenceMetrics.reset();
    vi.useFakeTimers();

    act(() => {
      for (let i = 1; i <= DUMP.length; i += 1) {
        result.current.setInput(DUMP.slice(0, i));
      }
    });

    const duringTyping = composerIntelligenceMetrics.snapshot();
    expect(duringTyping.keystrokes).toBe(DUMP_CHARS);
    expect(duringTyping.canonReconstructions).toBe(0);
    expect(duringTyping.remoteLexicalPreviews).toBe(0);
    expect(duringTyping.entityScans).toBe(0);
    expect(duringTyping.storageWrites).toBe(0);
    expect(duringTyping.reduxOccupancySyncs).toBeLessThanOrEqual(2);

    act(() => {
      vi.advanceTimersByTime(COMPOSER_LIGHTWEIGHT_PREVIEW_MS + COMPOSER_STORAGE_DEBOUNCE_MS + 30);
    });

    const afterIdle = composerIntelligenceMetrics.snapshot();
    expect(afterIdle.canonReconstructions).toBe(0);
    expect(afterIdle.remoteLexicalPreviews).toBe(0);
    expect(afterIdle.entityScans).toBeGreaterThan(0);
    expect(afterIdle.entityScans).toBeLessThanOrEqual(4);
    expect(afterIdle.storageWrites).toBeLessThanOrEqual(2);

    act(() => {
      result.current.handleComposerBlur();
    });

    const afterBlur = composerIntelligenceMetrics.snapshot();
    expect(afterBlur.canonReconstructions).toBe(1);
    expect(afterBlur.remoteLexicalPreviews).toBe(1);
    expect(afterBlur.entityScans).toBeLessThanOrEqual(8);
    expect(afterBlur.keystrokes).toBe(DUMP_CHARS);
  }, 20_000);

  it('does not rerender a long transcript for each keystroke in a mobile-sized shell', async () => {
    render(
      <Providers>
        <Shell />
      </Providers>,
    );

    const textarea = await screen.findByRole('textbox');
    await waitFor(() => {
      expect(fetchJson.mock.calls.some((call) => String(call[0]).includes('certified-index'))).toBe(true);
    });

    composerIntelligenceMetrics.reset();
    const sample = DUMP.slice(0, 80);
    for (let i = 1; i <= sample.length; i += 1) {
      fireEvent.change(textarea, { target: { value: sample.slice(0, i) } });
    }

    const typed = composerIntelligenceMetrics.snapshot();
    expect(typed.keystrokes).toBe(80);
    expect(typed.canonReconstructions).toBe(0);
    expect(typed.transcriptRenders).toBeLessThanOrEqual(4);
    expect(typed.layoutGrows).toBeLessThanOrEqual(80);
    expect(screen.getByTestId('has-draft').textContent).toBe('true');
  }, 15_000);
});
