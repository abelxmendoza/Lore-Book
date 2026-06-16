import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const persistMock = vi.fn();
vi.mock('../../src/services/conversationCentered/episodePersistenceService', () => ({
  persistEpisodesForThread: (...args: unknown[]) => persistMock(...args),
}));

const updateOnMessageMock = vi.fn();
vi.mock('../../src/services/conversationCentered/threadIntelligenceService', () => ({
  threadIntelligenceService: {
    updateOnMessage: (...args: unknown[]) => updateOnMessageMock(...args),
  },
}));

import { episodeSegmentationTrigger } from '../../src/services/conversationCentered/episodeSegmentationTrigger';

describe('episodeSegmentationTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    persistMock.mockReset();
    updateOnMessageMock.mockReset();
    persistMock.mockResolvedValue({
      threadId: 'thread-1',
      episodeCount: 2,
      created: 2,
      messagesTotal: 8,
      activeEpisodeId: 'ep-2',
      activeEpisodeLabel: 'Costco · Grandma Rose',
      episodeLabels: ['Thread start', 'Costco · Grandma Rose'],
      episodes: [],
      coverage: {
        messagesWithEntities: 4,
        messagesWithLocations: 2,
        episodesWithEvents: 1,
        episodesWithParticipants: 2,
        avgMessagesPerEpisode: 4,
      },
    });
    updateOnMessageMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces multiple schedule calls into one run', async () => {
    episodeSegmentationTrigger.schedule('user-1', 'thread-1');
    episodeSegmentationTrigger.schedule('user-1', 'thread-1');
    episodeSegmentationTrigger.schedule('user-1', 'thread-1');

    expect(persistMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    await Promise.resolve();

    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledWith('user-1', 'thread-1');
  });

  it('syncs threadMeta.episodes after a successful run', async () => {
    await episodeSegmentationTrigger.runNow('user-1', 'thread-1');

    expect(updateOnMessageMock).toHaveBeenCalledWith('user-1', 'thread-1', expect.objectContaining({
      replaceEpisodes: ['Thread start', 'Costco · Grandma Rose'],
      episodeId: 'ep-2',
      episodeLabel: 'Costco · Grandma Rose',
    }));
  });

  it('skips threadMeta update when no episodes produced', async () => {
    persistMock.mockResolvedValueOnce({
      threadId: 'thread-1',
      episodeCount: 0,
      created: 0,
      messagesTotal: 0,
      activeEpisodeId: null,
      activeEpisodeLabel: null,
      episodeLabels: [],
      episodes: [],
      coverage: {
        messagesWithEntities: 0,
        messagesWithLocations: 0,
        episodesWithEvents: 0,
        episodesWithParticipants: 0,
        avgMessagesPerEpisode: 0,
      },
    });

    await episodeSegmentationTrigger.runNow('user-1', 'thread-1');
    expect(updateOnMessageMock).not.toHaveBeenCalled();
  });

  it('runNow is idempotent while in flight', async () => {
    let resolvePersist!: (v: unknown) => void;
    persistMock.mockReturnValueOnce(new Promise((r) => { resolvePersist = r; }));

    const p1 = episodeSegmentationTrigger.runNow('user-1', 'thread-2');
    const p2 = episodeSegmentationTrigger.runNow('user-1', 'thread-2');
    resolvePersist!({
      threadId: 'thread-2',
      episodeCount: 1,
      created: 1,
      messagesTotal: 3,
      activeEpisodeId: 'ep-1',
      activeEpisodeLabel: 'Thread start',
      episodeLabels: ['Thread start'],
      episodes: [],
      coverage: {
        messagesWithEntities: 0,
        messagesWithLocations: 0,
        episodesWithEvents: 0,
        episodesWithParticipants: 0,
        avgMessagesPerEpisode: 3,
      },
    });
    await p1;
    await p2;
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});
