import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * captureProductionSummary's `events_assembled` count used to read from
 * `conversation_events` — a table nothing in the codebase ever writes to, so
 * the count was always 0 regardless of whether the narrative ladder
 * (eventAssemblyService) actually assembled anything. It should read from
 * `resolved_events`, the ladder's real output table, instead.
 */

const state = vi.hoisted(() => ({
  queriedTables: [] as string[],
  resolvedEventsCount: 0,
}));

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.queriedTables.push(table);
      const builder: Record<string, any> = {
        select: () => builder,
        eq: () => builder,
        gte: () =>
          Promise.resolve(
            table === 'resolved_events'
              ? { count: state.resolvedEventsCount, data: null, error: null }
              : { count: 0, data: null, error: null },
          ),
      };
      return builder;
    },
  },
}));

vi.mock('../../../src/services/ingestion/pipelineRunService', () => ({
  pipelineRunService: { recordStep: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ingestionQueue } from '../../../src/services/ingestion/ingestionQueue';
import { pipelineRunService } from '../../../src/services/ingestion/pipelineRunService';

describe('captureProductionSummary — events_assembled source table', () => {
  beforeEach(() => {
    state.queriedTables = [];
    state.resolvedEventsCount = 3;
    vi.clearAllMocks();
  });

  it('reports events_assembled from resolved_events, never conversation_events', async () => {
    await (ingestionQueue as any).captureProductionSummary(
      'run-1',
      'user-1',
      new Date().toISOString(),
      Date.now(),
      false,
    );

    expect(state.queriedTables).toContain('resolved_events');
    expect(state.queriedTables).not.toContain('conversation_events');

    expect(pipelineRunService.recordStep).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        step: 'production_summary',
        metadata: expect.objectContaining({ events_assembled: 3 }),
      }),
    );
  });
});
