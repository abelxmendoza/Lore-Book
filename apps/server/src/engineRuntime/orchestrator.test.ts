import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineOrchestrator } from './orchestrator';
import { buildEngineContext } from './contextBuilder';
import { saveEngineResults } from './storage';
import { DependencyGraph } from '../services/engineRegistry/dependencyGraph';
import { sensemakingOrchestrator } from '../services/engineGovernance';

// Hoist so vi.mock factory can reference it
const { mockEngineRegistry } = vi.hoisted(() => ({
  mockEngineRegistry: {
    health: vi.fn().mockResolvedValue({ status: 'healthy' }),
    financial: vi.fn().mockResolvedValue({ balance: 1000 }),
    habits: vi.fn().mockResolvedValue({ streaks: [] }),
    chronology: vi.fn().mockResolvedValue({ graph: {} }),
  },
}));

vi.mock('./contextBuilder');
vi.mock('./storage');
vi.mock('../services/engineRegistry/dependencyGraph');
vi.mock('../services/engineGovernance');
vi.mock('./engineRegistry', () => ({
  ENGINE_REGISTRY: mockEngineRegistry,
  hasEngine: vi.fn((name: string) => name in mockEngineRegistry),
}));

describe('EngineOrchestrator', () => {
  let orchestrator: EngineOrchestrator;
  let mockDependencyGraph: any;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      entries: [{ id: '1', content: 'test', date: '2024-01-01' }],
      relationships: [],
      goals: [],
      habits: [],
      user: { id: 'user-123' },
      now: new Date(),
    };

    (buildEngineContext as any).mockResolvedValue(mockContext);
    (saveEngineResults as any).mockResolvedValue(undefined);

    // Mock dependency graph
    mockDependencyGraph = {
      resolveOrder: vi.fn().mockResolvedValue(['health', 'financial', 'habits']),
      getDependencies: vi.fn().mockResolvedValue([]),
    };
    (DependencyGraph as any).mockImplementation(function (this: any) { return mockDependencyGraph; });

    // Mock sensemaking orchestrator
    (sensemakingOrchestrator.decideEnginesToRun as any) = vi.fn().mockResolvedValue([
      { engineName: 'health', shouldRun: true },
      { engineName: 'financial', shouldRun: true },
      { engineName: 'habits', shouldRun: true },
    ]);

    orchestrator = new EngineOrchestrator();
  });

  describe('runAll', () => {
    it('should run all engines when sensemaking is disabled', async () => {
      const results = await orchestrator.runAll('user-123', true, false);

      expect(results).toHaveProperty('health');
      expect(results).toHaveProperty('financial');
      expect(results).toHaveProperty('habits');
      expect(buildEngineContext).toHaveBeenCalledWith('user-123', {
        maxEntries: 1000,
        maxDays: 90,
        includeAll: false,
      });
    });

    it('should use sensemaking orchestrator when enabled', async () => {
      await orchestrator.runAll('user-123', true, true);

      expect(sensemakingOrchestrator.decideEnginesToRun).toHaveBeenCalled();
    });

    it('should group engines by dependency and run in batches', async () => {
      mockDependencyGraph.getDependencies = vi.fn().mockImplementation((engine: string) => {
        if (engine === 'financial') return ['health'];
        return [];
      });

      const results = await orchestrator.runAll('user-123', false, false);

      expect(results).toHaveProperty('health');
      expect(results).toHaveProperty('financial');
      expect(results).toHaveProperty('habits');
    });

    it('should handle engine failures gracefully', async () => {
      const mockRegistry = {
        health: vi.fn().mockResolvedValue({ status: 'healthy' }),
        financial: vi.fn().mockRejectedValue(new Error('Financial engine failed')),
        habits: vi.fn().mockResolvedValue({ streaks: [] }),
      };

      const customOrchestrator = new EngineOrchestrator(mockRegistry as any);
      const results = await customOrchestrator.runAll('user-123', false, false);

      expect(results.health.success).toBe(true);
      expect(results.financial.success).toBe(false);
      expect(results.financial.error).toContain('Financial engine failed');
      expect(results.habits.success).toBe(true);
    });

    it('should save results when save is true', async () => {
      await orchestrator.runAll('user-123', true, false);

      expect(saveEngineResults).toHaveBeenCalledWith('user-123', expect.any(Object));
    });

    it('should not save results when save is false', async () => {
      await orchestrator.runAll('user-123', false, false);

      expect(saveEngineResults).not.toHaveBeenCalled();
    });

    it('should respect concurrency limit', async () => {
      const mockRegistry: any = {};
      const enginePromises: Promise<any>[] = [];
      
      // Create 10 engines that take time to complete
      for (let i = 0; i < 10; i++) {
        mockRegistry[`engine${i}`] = vi.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve({ data: i }), 10))
        );
      }

      const limitedOrchestrator = new EngineOrchestrator(mockRegistry, 3); // Max 3 concurrent
      const start = Date.now();
      await limitedOrchestrator.runAll('user-123', false, false);
      const duration = Date.now() - start;

      // With concurrency of 3, 10 engines should take at least 4 batches
      // Each batch takes ~10ms, so minimum ~40ms
      expect(duration).toBeGreaterThan(30);
    });
  });

  describe('runSingle', () => {
    it('should run a single engine', async () => {
      const result = await orchestrator.runSingle('user-123', 'health');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: 'healthy' });
      expect(buildEngineContext).toHaveBeenCalled();
    });

    it('should return error for non-existent engine', async () => {
      const result = await orchestrator.runSingle('user-123', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle engine errors', async () => {
      const mockRegistry = {
        health: vi.fn().mockRejectedValue(new Error('Engine error')),
      };
      const customOrchestrator = new EngineOrchestrator(mockRegistry as any);

      const result = await customOrchestrator.runSingle('user-123', 'health');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Engine error');
    });

    it('should use all data for chronology and legacy engines', async () => {
      const mockRegistry = {
        chronology: vi.fn().mockResolvedValue({ graph: {} }),
      };
      const customOrchestrator = new EngineOrchestrator(mockRegistry as any);

      await customOrchestrator.runSingle('user-123', 'chronology');

      expect(buildEngineContext).toHaveBeenCalledWith('user-123', {
        maxEntries: 1000,
        maxDays: 90,
        includeAll: true,
      });
    });
  });

  describe('dependency grouping', () => {
    it('should group independent engines in same batch', async () => {
      mockDependencyGraph.getDependencies = vi.fn().mockResolvedValue([]);

      const results = await orchestrator.runAll('user-123', false, false);

      // All engines should complete
      expect(Object.keys(results).length).toBeGreaterThan(0);
    });

    it('should handle circular dependencies gracefully', async () => {
      mockDependencyGraph.getDependencies = vi.fn().mockImplementation((engine: string) => {
        if (engine === 'health') return ['financial'];
        if (engine === 'financial') return ['health']; // Circular
        return [];
      });

      const results = await orchestrator.runAll('user-123', false, false);

      // Should still complete despite circular dependency warning
      expect(Object.keys(results).length).toBeGreaterThan(0);
    });
  });
});
