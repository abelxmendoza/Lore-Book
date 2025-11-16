import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTimeline } from '../src/controllers/timelineController';
import { memoryService } from '../src/services/memoryService';

vi.mock('../src/services/memoryService', () => ({
  memoryService: {
    getTimeline: vi.fn(),
    listTags: vi.fn()
  }
}));

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('timelineController.getTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns grouped timeline for the user', async () => {
    const timeline = {
      chapters: [],
      unassigned: []
    };
    (memoryService.getTimeline as any).mockResolvedValue(timeline);

    const req: any = { user: { id: 'user-42' } };
    const res = mockResponse();

    await getTimeline(req, res);

    expect(memoryService.getTimeline).toHaveBeenCalledWith('user-42');
    expect(res.json).toHaveBeenCalledWith({ timeline });
  });
});
