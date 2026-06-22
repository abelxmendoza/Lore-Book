import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { makeStore } from '../../../store';
import { MockDataProvider } from '../../../contexts/MockDataContext';
import { GuestProvider } from '../../../contexts/GuestContext';
import { ChatComposer } from './ChatComposer';
import { resetEntityIndexerCache } from '../../../hooks/useEntityIndexer';

/** ChatComposer pulls runtime identity (mock + guest), so provide both. */
function renderComposer(ui: React.ReactElement) {
  return render(
    <Provider store={makeStore()}>
      <MockDataProvider>
        <GuestProvider>{ui}</GuestProvider>
      </MockDataProvider>
    </Provider>
  );
}

const fetchJson = vi.fn();

vi.mock('../../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../../../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
}));

vi.mock('../../../lib/supabase', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'test-user' }, session: { access_token: 'test-token' }, loading: false })),
  isSupabaseConfigured: vi.fn(() => true),
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

// Index loads from the real (mocked) API path, not the demo certified index.
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

describe('Composer entity chip flow (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEntityIndexerCache();
    fetchJson.mockResolvedValue({
      entities: [
        {
          id: 'uuid-abel',
          name: 'Abel',
          type: 'character',
          aliases: [],
          mentionKeys: ['abel'],
          status: 'confirmed',
        },
        {
          id: 'sug:character:kelly',
          name: 'Kelly',
          type: 'character',
          aliases: [],
          mentionKeys: ['kelly'],
          status: 'suggestion',
        },
      ],
    });
  });

  it('loads index, shows chips while typing, and submits visible matches', async () => {
    const onSubmit = vi.fn();
    renderComposer(<ChatComposer onSubmit={onSubmit} loading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Tell Abel and Kel' } });

    await waitFor(() => {
      expect(screen.getByTestId('composer-entity-chips')).toBeInTheDocument();
    });

    // Exact match → chip. Prefix match ("Kel" → Kelly) surfaces as a suggestion chip only.
    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('composer-entity-dismiss-character-uuid-abel'));
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, entities] = onSubmit.mock.calls[0];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Kelly');
  });

  it('shows retry UI when index load fails', async () => {
    // Fail every index fetch (the indexer may reload), so the error state sticks.
    fetchJson.mockReset();
    fetchJson.mockRejectedValue(new Error('offline'));

    renderComposer(<ChatComposer onSubmit={vi.fn()} loading={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('composer-index-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('composer-index-retry')).toBeInTheDocument();
  });
});
