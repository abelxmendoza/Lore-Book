import { beforeEach, describe, it, expect, vi } from 'vitest';
import { openEntity, updateSelectedEntity } from '../store/slices/selectionSlice';
import { openEntityModal } from './openEntityModal';

const demoRuntime = vi.hoisted(() => ({ active: false }));

vi.mock('./demoRuntime', () => ({
  isDemoRuntimeActive: () => demoRuntime.active,
}));

vi.mock('./hydrateBookEntity', () => ({
  isEphemeralEntityId: (id: string) => id.startsWith('dummy-'),
  locationStub: (id: string, name?: string) => ({
    id,
    name: name ?? 'Location',
    visitCount: 0,
    relatedPeople: [],
    tagCounts: [],
    chapters: [],
    moods: [],
    entries: [],
  }),
  fetchCharacterById: vi.fn(async (id: string) => ({
    id,
    name: 'Loaded Character',
    summary: 'Full profile',
    tags: ['friend'],
  })),
  fetchLocationById: vi.fn(async (id: string) => ({
    id,
    name: 'Loaded Location',
    visitCount: 2,
    relatedPeople: [],
    tagCounts: [],
    chapters: [],
    moods: [],
    entries: [],
  })),
}));

import { fetchCharacterById } from './hydrateBookEntity';

describe('openEntityModal', () => {
  beforeEach(() => {
    demoRuntime.active = false;
    vi.mocked(fetchCharacterById).mockClear();
  });

  it('opens immediately with a character stub then hydrates from the API', async () => {
    const dispatch = vi.fn();
    openEntityModal(dispatch as never, {
      type: 'character',
      id: 'char-1',
      name: 'Seed Name',
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const openAction = dispatch.mock.calls[0][0];
    expect(openAction.type).toBe(openEntity.type);
    expect(openAction.payload).toMatchObject({
      type: 'character',
      id: 'char-1',
      name: 'Seed Name',
    });

    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    const hydrateAction = dispatch.mock.calls[1][0];
    expect(hydrateAction.type).toBe(updateSelectedEntity.type);
    expect(hydrateAction.payload.character).toMatchObject({
      id: 'char-1',
      name: 'Loaded Character',
    });
    expect(fetchCharacterById).toHaveBeenCalledWith('char-1');
  });

  it('skips hydration for ephemeral ids', () => {
    const dispatch = vi.fn();
    openEntityModal(dispatch as never, {
      type: 'character',
      id: 'dummy-char',
      name: 'Demo',
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('uses the local seed without an authenticated fetch in demo runtime', () => {
    demoRuntime.active = true;
    const dispatch = vi.fn();

    openEntityModal(dispatch as never, {
      type: 'character',
      id: 'char-demo-legacy',
      name: 'Alex',
      seed: { id: 'char-demo-legacy', name: 'Alex', role: 'Friend' },
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fetchCharacterById).not.toHaveBeenCalled();
  });
});
