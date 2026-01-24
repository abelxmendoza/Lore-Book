import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestratorService } from '../../src/services/orchestratorService';

vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntriesWithCorrections: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/personaService', () => ({
  personaService: {
    getPersona: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/services/taskEngineService', () => ({
  taskEngineService: {
    listTasks: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/integrations/integration.service', () => ({
  integrationAggregationService: {
    getDistilled: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../src/services/github/githubSyncManager', () => ({
  githubSyncManager: {
    listSummaries: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/hqiService', () => ({
  hqiService: { search: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('OrchestratorService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getSummary', () => {
    it('returns summary with expected shape', async () => {
      const summary = await orchestratorService.getSummary('user-1');
      expect(summary).toHaveProperty('timeline');
      expect(summary).toHaveProperty('identity');
      expect(summary).toHaveProperty('continuity');
      expect(summary).toHaveProperty('characters');
      expect(summary).toHaveProperty('tasks');
      expect(summary).toHaveProperty('arcs');
      expect(summary).toHaveProperty('season');
      expect(summary).toHaveProperty('autopilot');
      expect(summary).toHaveProperty('saga');
      expect(summary).toHaveProperty('integrations');
      expect(summary).toHaveProperty('github');
      expect(Array.isArray(summary.timeline.events)).toBe(true);
      expect(Array.isArray(summary.timeline.arcs)).toBe(true);
    });
  });

  describe('getTimeline', () => {
    it('returns timeline with events and arcs', async () => {
      const timeline = await orchestratorService.getTimeline('user-1');
      expect(timeline).toHaveProperty('events');
      expect(timeline).toHaveProperty('arcs');
      expect(timeline).toHaveProperty('season');
    });
  });

  describe('searchHQI', () => {
    it('returns results', async () => {
      const res = await orchestratorService.searchHQI('test');
      expect(res).toHaveProperty('results');
    });
  });
});
