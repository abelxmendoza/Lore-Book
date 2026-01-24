import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cron from 'node-cron';
import { startEngineScheduler } from './scheduler';
import { EngineOrchestrator } from './orchestrator';
import { supabaseAdmin } from '../services/supabaseClient';

vi.mock('node-cron');
vi.mock('./orchestrator');
vi.mock('../services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Engine Scheduler', () => {
  let mockSchedule: any;
  let mockOrchestrator: any;
  let mockRunAll: any;
  let mockFrom: any;
  let mockSelect: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRunAll = vi.fn().mockResolvedValue({
      health: { success: true, data: {} },
    });

    mockOrchestrator = {
      runAll: mockRunAll,
    };

    // Must be a constructor (scheduler does new EngineOrchestrator())
    (EngineOrchestrator as any).mockImplementation(function (this: any) {
      return mockOrchestrator;
    });

    mockSelect = vi.fn().mockResolvedValue({
      data: [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ],
      error: null,
    });

    mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    (supabaseAdmin.from as any) = mockFrom;

    mockSchedule = vi.fn();
    (cron.schedule as any) = mockSchedule;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('startEngineScheduler', () => {
    it('should start cron scheduler', () => {
      startEngineScheduler();

      expect(cron.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    });

    it('should fetch all users when scheduled job runs', async () => {
      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      expect(mockFrom).toHaveBeenCalledWith('users');
      expect(mockSelect).toHaveBeenCalledWith('id');
    });

    it('should run engines for all users', async () => {
      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      expect(mockRunAll).toHaveBeenCalledTimes(3);
      expect(mockRunAll).toHaveBeenCalledWith('user-1', true);
      expect(mockRunAll).toHaveBeenCalledWith('user-2', true);
      expect(mockRunAll).toHaveBeenCalledWith('user-3', true);
    });

    it('should handle empty user list', async () => {
      mockSelect.mockResolvedValue({
        data: [],
        error: null,
      });

      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      expect(mockRunAll).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      expect(mockRunAll).not.toHaveBeenCalled();
    });

    it('should handle individual user engine failures', async () => {
      mockRunAll
        .mockResolvedValueOnce({ health: { success: true } })
        .mockRejectedValueOnce(new Error('User 2 error'))
        .mockResolvedValueOnce({ health: { success: true } });

      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      // All users should still be processed
      expect(mockRunAll).toHaveBeenCalledTimes(3);
    });

    it('should use save=true to cache results', async () => {
      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      await scheduledFunction();

      expect(mockRunAll).toHaveBeenCalledWith(expect.any(String), true);
    });

    it('should handle scheduler errors', async () => {
      mockSelect.mockRejectedValue(new Error('Scheduler error'));

      startEngineScheduler();

      const scheduledFunction = mockSchedule.mock.calls[0][1];
      
      // Should not throw
      await expect(scheduledFunction()).resolves.not.toThrow();
    });
  });
});
