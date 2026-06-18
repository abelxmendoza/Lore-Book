import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep the server-state chain deterministic by mocking the fetch wrapper.
vi.mock('../lib/api', () => ({ fetchJson: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false })),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigDebug: vi.fn().mockReturnValue({}),
}));

import { useCurrentContext } from '../contexts/CurrentContextContext';
import { useEntityModal } from '../contexts/EntityModalContext';
import { useSoulProfileChatContext } from '../contexts/SoulProfileChatContext';
import { fetchJson } from '../lib/api';

import { useGetEntriesQuery } from './api/loreApi';
import { bindLegacyEntityEvents } from './legacyEventBridge';
import { useAppSelector } from './hooks';
import { setActiveThreadId, setCurrentThreadId } from './slices/chatSlice';
import { selectActiveThreadId, selectCurrentThreadId } from './selectors';

import { makeStore } from './index';

const mockedFetchJson = vi.mocked(fetchJson);

function renderWithStore(ui: React.ReactElement, store = makeStore()) {
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

// ── Adapter context consumers ────────────────────────────────────────────────
function EntityModalConsumer() {
  const { selectedEntity, isOpen, openEntity, closeEntity } = useEntityModal();
  return (
    <div>
      <span data-testid="entity-name">{selectedEntity?.name ?? 'none'}</span>
      <span data-testid="entity-open">{String(isOpen)}</span>
      <button onClick={() => openEntity({ type: 'character', id: 'c1', name: 'Ada' })}>open</button>
      <button onClick={closeEntity}>close</button>
    </div>
  );
}

function CurrentContextConsumer() {
  const { currentContext, setCurrentContext } = useCurrentContext();
  return (
    <div>
      <span data-testid="ctx-kind">{currentContext.kind}</span>
      <button onClick={() => setCurrentContext({ kind: 'thread', threadId: 't1' })}>set</button>
    </div>
  );
}

function SoulProfileConsumer() {
  const { soulProfileContext, setSoulProfileContext } = useSoulProfileChatContext();
  return (
    <div>
      <span data-testid="soul">{soulProfileContext?.lastReferencedInsightId ?? 'none'}</span>
      <button onClick={() => setSoulProfileContext({ lastReferencedInsightId: 'i1' })}>set</button>
    </div>
  );
}

function EntriesView() {
  const { data, isLoading } = useGetEntriesQuery();
  if (isLoading) return <span>loading</span>;
  return <span data-testid="entries-count">{data?.length ?? 0}</span>;
}

describe('store integration', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
  });

  describe('context adapters backed by Redux', () => {
    it('opens and closes the entity modal through the store', () => {
      renderWithStore(<EntityModalConsumer />);
      expect(screen.getByTestId('entity-open').textContent).toBe('false');

      fireEvent.click(screen.getByText('open'));
      expect(screen.getByTestId('entity-name').textContent).toBe('Ada');
      expect(screen.getByTestId('entity-open').textContent).toBe('true');

      fireEvent.click(screen.getByText('close'));
      // Modal flag flips immediately; entity is cleared after the close animation.
      expect(screen.getByTestId('entity-open').textContent).toBe('false');
    });

    it('shares selection state across separate consumers via one store', () => {
      const store = makeStore();
      renderWithStore(
        <>
          <EntityModalConsumer />
          <CurrentContextConsumer />
        </>,
        store
      );
      fireEvent.click(screen.getByText('set'));
      expect(screen.getByTestId('ctx-kind').textContent).toBe('thread');
      expect(store.getState().selection.currentContext).toEqual({ kind: 'thread', threadId: 't1' });
    });

    it('updates soul profile context through the store', () => {
      renderWithStore(<SoulProfileConsumer />);
      fireEvent.click(screen.getByText('set'));
      expect(screen.getByTestId('soul').textContent).toBe('i1');
    });
  });

  describe('RTK Query server-state', () => {
    it('loads entries through the fetchJson baseQuery', async () => {
      mockedFetchJson.mockResolvedValue({ entries: [{ id: 'e1' }, { id: 'e2' }] });
      renderWithStore(<EntriesView />);
      await screen.findByTestId('entries-count');
      expect(screen.getByTestId('entries-count').textContent).toBe('2');
      expect(mockedFetchJson).toHaveBeenCalledTimes(1);
    });

    it('refetches when the legacy lk:story-data-updated event fires', async () => {
      mockedFetchJson.mockResolvedValue({ entries: [{ id: 'e1' }] });
      const store = makeStore();
      const unbind = bindLegacyEntityEvents(store.dispatch);
      try {
        renderWithStore(<EntriesView />, store);
        await screen.findByTestId('entries-count');
        expect(mockedFetchJson).toHaveBeenCalledTimes(1);

        act(() => {
          window.dispatchEvent(new Event('lk:story-data-updated'));
        });

        await waitFor(() => expect(mockedFetchJson).toHaveBeenCalledTimes(2));
      } finally {
        unbind();
      }
    });
  });

  describe('chat slice', () => {
    function ChatSelectionConsumer() {
      const active = useAppSelector(selectActiveThreadId);
      const current = useAppSelector(selectCurrentThreadId);
      return (
        <div>
          <span data-testid="chat-active">{active ?? 'none'}</span>
          <span data-testid="chat-current">{current ?? 'none'}</span>
        </div>
      );
    }

    it('shares active and current thread ids through one store', () => {
      const store = makeStore();
      renderWithStore(<ChatSelectionConsumer />, store);
      expect(screen.getByTestId('chat-active').textContent).toBe('none');

      act(() => {
        store.dispatch(setActiveThreadId('active-1'));
        store.dispatch(setCurrentThreadId('current-1'));
      });

      expect(screen.getByTestId('chat-active').textContent).toBe('active-1');
      expect(screen.getByTestId('chat-current').textContent).toBe('current-1');
    });
  });
});
