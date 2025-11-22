import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id' };
    next();
  },
}));

vi.mock('../services/memoryService', () => ({
  memoryService: {
    saveEntry: vi.fn(),
    getEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    searchEntries: vi.fn(),
  },
}));

vi.mock('../services/tagService', () => ({
  tagService: {
    suggestTags: vi.fn(),
  },
}));

vi.mock('../services/voiceService', () => ({
  voiceService: {
    transcribe: vi.fn(),
    formatTranscript: vi.fn(),
  },
}));

describe('Entries API', () => {
  let app: express.Application;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    
    // Import the router - it's exported as 'router' from entries.ts
    const entriesModule = await import('./entries');
    const entriesRouter = (entriesModule as any).router;
    app.use('/api/entries', entriesRouter);
    
    vi.clearAllMocks();
  });

  describe('POST /api/entries', () => {
    it('should create a new entry', async () => {
      const { memoryService } = await import('../services/memoryService');
      const mockEntry = {
        id: 'entry-1',
        content: 'Test entry',
        date: new Date().toISOString(),
        user_id: 'test-user-id',
      };
      
      vi.mocked(memoryService.saveEntry).mockResolvedValue(mockEntry as any);

      const response = await request(app)
        .post('/api/entries')
        .send({
          content: 'Test entry',
          date: new Date().toISOString(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('entry');
      expect(response.body.entry.content).toBe('Test entry');
      expect(memoryService.saveEntry).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/entries')
        .send({
          // Missing content
          date: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/entries/:id', () => {
    it('should get an entry by id', async () => {
      const { memoryService } = await import('../services/memoryService');
      const mockEntry = {
        id: 'entry-1',
        content: 'Test entry',
        date: new Date().toISOString(),
        user_id: 'test-user-id',
      };
      
      vi.mocked(memoryService.getEntry).mockResolvedValue(mockEntry as any);

      const response = await request(app)
        .get('/api/entries/entry-1')
        .expect(200);

      expect(response.body).toHaveProperty('entry');
      expect(response.body.entry.id).toBe('entry-1');
    });

    it('should return 404 for non-existent entry', async () => {
      const { memoryService } = await import('../services/memoryService');
      vi.mocked(memoryService.getEntry).mockResolvedValue(null);

      await request(app)
        .get('/api/entries/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/entries/suggest-tags', () => {
    it('should suggest tags for content', async () => {
      const { tagService } = await import('../services/tagService');
      const mockTags = ['work', 'project', 'coding'];
      
      vi.mocked(tagService.suggestTags).mockResolvedValue(mockTags);

      const response = await request(app)
        .post('/api/entries/suggest-tags')
        .send({
          content: 'Working on a coding project today',
        })
        .expect(200);

      expect(response.body).toHaveProperty('tags');
      expect(response.body.tags).toEqual(mockTags);
      expect(tagService.suggestTags).toHaveBeenCalledWith('Working on a coding project today');
    });
  });
});


