import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';

import { makeStore } from '../../../store';
import { ChatComposer } from './ChatComposer';
import { resetEntityIndexerCache } from '../../../hooks/useEntityIndexer';
import { clearLexicalPreviewSharedCache } from '../../../lib/lexicalPreviewCache';
import { clearLoreBookParseSharedCache } from '../../../lib/loreBookParseCache';

const fetchJson = vi.fn();
const mockFetchLoreBookParseShared = vi.fn();
const mockFetchLexicalPreviewShared = vi.fn();

vi.mock('../../../lib/loreBookParseCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/loreBookParseCache')>();
  return {
    ...actual,
    fetchLoreBookParseShared: (...args: unknown[]) => mockFetchLoreBookParseShared(...args),
  };
});

vi.mock('../../../lib/lexicalPreviewCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/lexicalPreviewCache')>();
  return {
    ...actual,
    fetchLexicalPreviewShared: (...args: unknown[]) => mockFetchLexicalPreviewShared(...args),
  };
});

vi.mock('../../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../../../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('../../../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: vi.fn(() => false),
  useShouldUseMockData: vi.fn(() => false),
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

function mockComposerFetch(options?: { lorebookFails?: boolean }) {
  mockFetchLexicalPreviewShared.mockResolvedValue({
    spans: [],
    inferredAssociations: [],
    ambiguities: [],
  });
  mockFetchLoreBookParseShared.mockImplementation(async () => {
    if (options?.lorebookFails) throw new Error('lorebook offline');
    return {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          confidence: 0.9,
          gate: 'suggest',
        },
      ],
      redirects: [
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'cross_book_guard',
          confidence: 0.85,
        },
      ],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 2,
    };
  });
  fetchJson.mockImplementation((url: string) => {
    if (url.includes('/api/entities/certified-index')) {
      return Promise.resolve({
        entities: [
          {
            id: 'uuid-abel',
            name: 'Abel',
            type: 'character',
            aliases: [],
            mentionKeys: ['abel'],
            status: 'confirmed',
          },
        ],
      });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

describe('LoreBook composer flow (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityIndexerCache();
    clearLexicalPreviewSharedCache();
    clearLoreBookParseSharedCache();
    mockComposerFetch();
  });

  it('shows LoreBook parse draft chips after typing', async () => {
    render(
      <Provider store={makeStore()}>
        <ChatComposer onSubmit={vi.fn()} loading={false} />
      </Provider>
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Oscar went to Gothicumbia' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    await waitFor(
      () => {
        expect(
          screen.getByTestId('composer-entity-chip-character-draft:lorebook:character:oscar martinez')
        ).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    expect(mockFetchLoreBookParseShared).toHaveBeenCalled();
  });

  it('still shows index chips when LoreBook parse API fails', async () => {
    mockComposerFetch({ lorebookFails: true });

    render(
      <Provider store={makeStore()}>
        <ChatComposer onSubmit={vi.fn()} loading={false} />
      </Provider>
    );

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Tell Abel about the trip' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    vi.useRealTimers();

    await waitFor(
      () => {
        expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
