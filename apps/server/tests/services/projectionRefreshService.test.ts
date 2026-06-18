import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/biographyFoundationService', () => ({
  biographyFoundationService: {
    generateBiography: vi.fn(),
  },
}));

vi.mock('../../src/services/timelineFoundationService', () => ({
  timelineFoundationService: {
    refreshResolvedEvent: vi.fn(),
  },
}));

vi.mock('../../src/services/artifactRegistry', () => ({
  artifactRegistry: {
    get: vi.fn(),
  },
}));

import { biographyFoundationService } from '../../src/services/biographyFoundationService';
import { timelineFoundationService } from '../../src/services/timelineFoundationService';
import { artifactRegistry } from '../../src/services/artifactRegistry';
import { refreshProjection, refreshStaleProjections } from '../../src/services/projectionRefreshService';

describe('projectionRefreshService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes biography snapshots via foundation generate', async () => {
    vi.mocked(biographyFoundationService.generateBiography).mockResolvedValue({
      snapshot: 'Updated bio',
      generatedAt: '2026-06-18T00:00:00Z',
    } as never);
    vi.mocked(artifactRegistry.get).mockResolvedValue({
      entry: {
        id: 'bio-1',
        type: 'biography_snapshot',
        createdAt: '2026-06-18T00:00:00Z',
        sourceTable: 'narrative_accounts',
        stale: false,
      },
      record: {},
    });

    const result = await refreshProjection('user-1', 'bio-1', 'biography_snapshot');

    expect(result.refreshed).toBe(true);
    expect(biographyFoundationService.generateBiography).toHaveBeenCalledWith('user-1');
    expect(result.artifact?.stale).toBe(false);
  });

  it('refreshes timeline events via timeline foundation', async () => {
    vi.mocked(timelineFoundationService.refreshResolvedEvent).mockResolvedValue(true);
    vi.mocked(artifactRegistry.get).mockResolvedValue({
      entry: {
        id: 'evt-1',
        type: 'timeline_event',
        createdAt: '2026-06-18T00:00:00Z',
        sourceTable: 'resolved_events',
        stale: false,
      },
      record: {},
    });

    const result = await refreshProjection('user-1', 'evt-1', 'timeline_event');

    expect(result.refreshed).toBe(true);
    expect(timelineFoundationService.refreshResolvedEvent).toHaveBeenCalledWith('user-1', 'evt-1');
  });

  it('refreshStaleProjections only processes stale items', async () => {
    vi.mocked(timelineFoundationService.refreshResolvedEvent).mockResolvedValue(true);
    vi.mocked(artifactRegistry.get).mockResolvedValue({
      entry: {
        id: 'evt-1',
        type: 'timeline_event',
        createdAt: '2026-06-18T00:00:00Z',
        sourceTable: 'resolved_events',
        stale: false,
      },
      record: {},
    });

    const results = await refreshStaleProjections('user-1', [
      { id: 'evt-1', type: 'timeline_event', stale: true },
      { id: 'evt-2', type: 'timeline_event', stale: false },
    ]);

    expect(results).toHaveLength(1);
    expect(timelineFoundationService.refreshResolvedEvent).toHaveBeenCalledTimes(1);
  });
});
