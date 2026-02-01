import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPersonalStrategyTrainingJob } from '../../src/jobs/personalStrategyTrainingJob';

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockReturnValue({ /* scheduled */ }),
  },
}));

describe('Personal Strategy Training Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registerPersonalStrategyTrainingJob does not throw', () => {
    expect(() => registerPersonalStrategyTrainingJob()).not.toThrow();
  });
});
