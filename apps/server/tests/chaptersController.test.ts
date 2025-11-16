import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChapter } from '../src/controllers/chaptersController';
import { chapterService } from '../src/services/chapterService';

vi.mock('../src/services/chapterService', () => ({
  chapterService: {
    createChapter: vi.fn(),
    listChapters: vi.fn(),
    getChapter: vi.fn(),
    saveSummary: vi.fn()
  }
}));
vi.mock('../src/services/chatService', () => ({
  chatService: { summarizeEntries: vi.fn() }
}));
vi.mock('../src/services/memoryService', () => ({
  memoryService: { searchEntries: vi.fn() }
}));

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('chaptersController.createChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a chapter for the authenticated user', async () => {
    const fakeChapter = {
      id: 'chapter-1',
      user_id: 'user-1',
      title: 'Arc One',
      start_date: '2024-01-01',
      description: null
    } as any;
    (chapterService.createChapter as any).mockResolvedValue(fakeChapter);

    const req: any = {
      body: { title: 'Arc One', startDate: '2024-01-01', description: null },
      user: { id: 'user-1' }
    };
    const res = mockResponse();

    await createChapter(req, res);

    expect(chapterService.createChapter).toHaveBeenCalledWith('user-1', {
      title: 'Arc One',
      startDate: '2024-01-01',
      description: null
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ chapter: fakeChapter });
  });
});
