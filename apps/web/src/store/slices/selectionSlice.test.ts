import { describe, it, expect } from 'vitest';

import type { EntityData } from '../../components/entity/EntityDetailModal';

import {
  selectionReducer,
  openEntity,
  updateSelectedEntity,
  closeEntityModal,
  clearSelectedEntity,
  setCurrentContext,
  setSoulProfileContext,
  setChatFocus,
  clearChatFocus,
  recordChatFocusMessage,
  type SelectionState,
} from './selectionSlice';
import { emptyChatFocusSessionStats } from '../../types/chatFocus';

const character: EntityData = { type: 'character', id: 'c1', name: 'Ada' };

const initial: SelectionState = {
  selectedEntity: null,
  entityModalOpen: false,
  currentContext: { kind: 'none' },
  lastNonNoneContext: null,
  soulProfileContext: null,
  chatFocus: null,
};

describe('selectionSlice', () => {
  it('opens an entity and marks the modal open', () => {
    const next = selectionReducer(initial, openEntity(character));
    expect(next.selectedEntity).toEqual(character);
    expect(next.entityModalOpen).toBe(true);
  });

  it('merges updates into the selected entity', () => {
    const opened = selectionReducer(initial, openEntity(character));
    const updated = selectionReducer(
      opened,
      updateSelectedEntity({ type: 'character', id: 'c1', description: 'Mathematician' })
    );
    expect(updated.selectedEntity).toMatchObject({ id: 'c1', name: 'Ada', description: 'Mathematician' });
  });

  it('treats an update with no prior entity as a set', () => {
    const updated = selectionReducer(initial, updateSelectedEntity(character));
    expect(updated.selectedEntity).toEqual(character);
  });

  it('closes the modal but keeps the entity until cleared', () => {
    const opened = selectionReducer(initial, openEntity(character));
    const closed = selectionReducer(opened, closeEntityModal());
    expect(closed.entityModalOpen).toBe(false);
    expect(closed.selectedEntity).toEqual(character);
    const cleared = selectionReducer(closed, clearSelectedEntity());
    expect(cleared.selectedEntity).toBeNull();
  });

  it('tracks lastNonNoneContext when setting a non-none context', () => {
    const onThread = selectionReducer(initial, setCurrentContext({ kind: 'thread', threadId: 't1' }));
    expect(onThread.currentContext).toEqual({ kind: 'thread', threadId: 't1' });
    expect(onThread.lastNonNoneContext).toEqual({ kind: 'thread', threadId: 't1' });

    const backToNone = selectionReducer(onThread, setCurrentContext({ kind: 'none' }));
    expect(backToNone.currentContext).toEqual({ kind: 'none' });
    // lastNonNoneContext is preserved across a transient none
    expect(backToNone.lastNonNoneContext).toEqual({ kind: 'thread', threadId: 't1' });
  });

  it('sets and clears the soul profile context', () => {
    const ctx = { lastReferencedInsightId: 'i1' };
    const withCtx = selectionReducer(initial, setSoulProfileContext(ctx));
    expect(withCtx.soulProfileContext).toEqual(ctx);
    const cleared = selectionReducer(withCtx, setSoulProfileContext(null));
    expect(cleared.soulProfileContext).toBeNull();
  });

  it('tracks chat focus and session deepening stats', () => {
    const focus = {
      entityId: 'rel-001',
      entityName: 'Alex',
      entityType: 'character' as const,
      sourceSurface: 'love' as const,
      sourceLabel: 'Love & Relationships',
      relationshipId: 'rel-001',
      sessionStats: emptyChatFocusSessionStats(),
    };
    const withFocus = selectionReducer(initial, setChatFocus(focus));
    expect(withFocus.chatFocus?.entityName).toBe('Alex');
    expect(withFocus.chatFocus?.arrivedAt).toBeDefined();

    const afterMsg = selectionReducer(
      withFocus,
      recordChatFocusMessage({ message: 'I miss Alex and feel closer when we talk' })
    );
    expect(afterMsg.chatFocus?.sessionStats.messagesSent).toBe(1);
    expect(afterMsg.chatFocus?.sessionStats.connectionDelta).toBeGreaterThan(0);
    expect(afterMsg.chatFocus?.statBumpKey).toBe(1);

    const cleared = selectionReducer(afterMsg, clearChatFocus());
    expect(cleared.chatFocus).toBeNull();
  });
});
