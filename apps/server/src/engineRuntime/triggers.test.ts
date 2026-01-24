import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onNewEntry } from './triggers';
import { EngineOrchestrator } from './orchestrator';

vi.mock('./orchestrator');
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Engine Triggers', () => {
  let mockOrchestrator: any;
  let mockRunAll: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockRunAll = vi.fn().mockResolvedValue({
      health: { success: true, data: {} },
    });

    mockOrchestrator = {
      runAll: mockRunAll,
    };

    // Must be a constructor (triggers does new EngineOrchestrator())
    (EngineOrchestrator as any).mockImplementation(function (this: any) {
      return mockOrchestrator;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('onNewEntry', () => {
    it('should trigger engine processing for new entry', async () => {
      onNewEntry('user-123', 'entry-456');

      // Wait for async processing
      await vi.runAllTimersAsync();

      expect(EngineOrchestrator).toHaveBeenCalled();
      expect(mockRunAll).toHaveBeenCalledWith('user-123', true);
    });

    it('should retry on failure with exponential backoff', async () => {
      let attemptCount = 0;
      mockRunAll.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Engine error');
        }
        return Promise.resolve({ health: { success: true } });
      });

      onNewEntry('user-123', 'entry-456');

      // Fast-forward through retries
      await vi.advanceTimersByTimeAsync(5000); // First retry delay
      await vi.advanceTimersByTimeAsync(10000); // Second retry delay
      await vi.runAllTimersAsync();

      expect(mockRunAll).toHaveBeenCalledTimes(3);
    });

    it('should not throw errors (fire-and-forget)', async () => {
      mockRunAll.mockRejectedValue(new Error('Persistent error'));

      // Should not throw
      expect(() => {
        onNewEntry('user-123', 'entry-456');
      }).not.toThrow();

      await vi.runAllTimersAsync();
    });

    it('should handle orchestrator instantiation errors', async () => {
      (EngineOrchestrator as any).mockImplementation(() => {
        throw new Error('Orchestrator error');
      });

      // Should not throw
      expect(() => {
        onNewEntry('user-123', 'entry-456');
      }).not.toThrow();

      await vi.runAllTimersAsync();
    });

    it('should use save=true to cache results', async () => {
      onNewEntry('user-123', 'entry-456');

      await vi.runAllTimersAsync();

      expect(mockRunAll).toHaveBeenCalledWith('user-123', true);
    });
  });
});
