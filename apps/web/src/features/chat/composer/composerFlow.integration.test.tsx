import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';

import { makeStore } from '../../../store';
import { MockDataProvider } from '../../../contexts/MockDataContext';
import { GuestProvider } from '../../../contexts/GuestContext';
import { ChatComposer } from './ChatComposer';
import { resetEntityIndexerCache } from '../../../hooks/useEntityIndexer';

/** ChatComposer pulls runtime identity (mock + guest), so provide both.
 *  MockDataProvider uses useLocation() (demo/admin route-leak fix), so it
 *  needs a Router ancestor too. */
function renderComposer(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <Provider store={makeStore()}>
        <MockDataProvider>
          <GuestProvider>{ui}</GuestProvider>
        </MockDataProvider>
      </Provider>
    </MemoryRouter>
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
      // fetchJson is a single shared mock hit by both the certified-entity-index
      // endpoint and the debounced LoreBook-parse endpoint (fetchLoreBookParse) —
      // longer composer text can trigger the latter. Without these fields,
      // opsFromParse's `[...parse.operations, ...parse.redirects]` throws on
      // undefined, surfacing as an unhandled rejection in any test whose input
      // reaches that debounce window.
      operations: [],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 0,
    });
  });

  it('loads index, shows chips while typing, and submits included matches', async () => {
    const onSubmit = vi.fn();
    renderComposer(<ChatComposer onSubmit={onSubmit} loading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Tell Abel about the trip' } });

    await waitFor(
      () => {
        expect(screen.getByTestId('composer-entity-chips')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, entities] = onSubmit.mock.calls[0];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Abel');
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

  it('applies initialPrompt once and does NOT re-inject it after the field is cleared', async () => {
    const onApplied = vi.fn();
    renderComposer(
      <ChatComposer
        onSubmit={vi.fn()}
        loading={false}
        initialPrompt="Catch up with Maria"
        onInitialPromptApplied={onApplied}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('Catch up with Maria'));
    expect(onApplied).toHaveBeenCalledTimes(1);

    // Regression: clearing the field must not re-trigger the prompt injection
    // (previously `input` was an effect dep with a `!input` guard → endless loop).
    fireEvent.change(textarea, { target: { value: '' } });
    await waitFor(() => expect(textarea.value).toBe(''));
    // Give any stray effects a chance to run, then confirm it stayed cleared.
    await new Promise((r) => setTimeout(r, 50));
    expect(textarea.value).toBe('');
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('does not fold a fast follow-up typed during the autoSubmit delay into the auto-sent message', async () => {
    // Regression for a live incident: a character's focus-chip flow pre-fills
    // an initialPrompt with autoSubmit, which fires 350ms later. Typing a
    // follow-up in that window used to get concatenated into the same
    // outgoing message (since the injected prompt and the live textarea
    // shared one mutable `input` state) — the two turns became one, and the
    // reply never completed.
    const onSubmit = vi.fn();
    const onAutoSubmitDone = vi.fn();
    renderComposer(
      <ChatComposer
        onSubmit={onSubmit}
        loading={false}
        initialPrompt="I want to talk about Jordan the Hiring Manager."
        autoSubmit
        onAutoSubmitDone={onAutoSubmitDone}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() =>
      expect(textarea.value).toBe('I want to talk about Jordan the Hiring Manager.'),
    );

    // Type a fast follow-up well within the 350ms auto-submit delay.
    fireEvent.change(textarea, {
      target: { value: 'I want to talk about Jordan the Hiring Manager.\n\n\n\nwho is he' },
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // The auto-sent message is exactly the injected prompt — not merged with
    // the user's typed follow-up.
    expect(onSubmit.mock.calls[0][0]).toBe('I want to talk about Jordan the Hiring Manager.');
    expect(onAutoSubmitDone).toHaveBeenCalledTimes(1);

    // The user's follow-up is preserved as their own live draft, not
    // silently discarded and not left merged with the already-sent prompt.
    expect(textarea.value).toBe(
      'I want to talk about Jordan the Hiring Manager.\n\n\n\nwho is he',
    );
  });
});
