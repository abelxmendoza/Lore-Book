import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { makeStore } from '../../../store';
import { ChatComposer } from './ChatComposer';
import { resetEntityIndexerCache } from '../../../hooks/useEntityIndexer';

const fetchJson = vi.fn();

vi.mock('../../../lib/api', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock('../../../lib/cache', () => ({
  apiCache: { delete: vi.fn() },
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
    render(
      <Provider store={makeStore()}>
        <ChatComposer onSubmit={onSubmit} loading={false} />
      </Provider>
    );

    const textarea = screen.getByPlaceholderText('Message Lore Book...');
    fireEvent.change(textarea, { target: { value: 'Tell Abel and Kel' } });

    await waitFor(() => {
      expect(screen.getByTestId('composer-entity-chips')).toBeInTheDocument();
    });

    expect(screen.getByTestId('composer-entity-chip-character-uuid-abel')).toBeInTheDocument();
    expect(screen.getByTestId('composer-entity-chip-character-sug:character:kelly')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('composer-entity-dismiss-character-uuid-abel'));
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, entities] = onSubmit.mock.calls[0];
    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe('Kelly');
  });

  it('shows retry UI when index load fails', async () => {
    fetchJson.mockRejectedValueOnce(new Error('offline'));

    render(
      <Provider store={makeStore()}>
        <ChatComposer onSubmit={vi.fn()} loading={false} />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('composer-index-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('composer-index-retry')).toBeInTheDocument();
  });
});
