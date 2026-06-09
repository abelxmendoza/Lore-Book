import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { threadsRouter } from '../../src/routes/threads';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');

vi.mock('../../src/middleware/validateRequest', () => ({
  validateRequest: (_schema: any) => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/services/threads/threadService', () => ({
  threadService: {
    create: vi.fn(),
    listByUser: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/services/threads/threadMembershipService', () => ({
  threadMembershipService: {
    addMembership: vi.fn(),
    removeMembership: vi.fn(),
    removeMembershipById: vi.fn(),
    getMembershipsForNode: vi.fn(),
    getThreadsForNode: vi.fn(),
  },
}));

vi.mock('../../src/services/threads/threadTimelineService', () => ({
  threadTimelineService: {
    getThreadTimeline: vi.fn(),
    getThreadInterruptions: vi.fn(),
  },
}));

vi.mock('../../src/services/threads/nodeRelationService', () => ({
  nodeRelationService: {
    create: vi.fn(),
    listByUser: vi.fn(),
    listByNode: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/services/timelineManager', () => ({
  timelineManager: {
    getNode: vi.fn(),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/threads', threadsRouter);

describe('Threads Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockThread = {
    id: 'thread-abc',
    user_id: 'user-123',
    name: 'Career Pivot',
    category: 'career',
    description: 'Exploring a move into product',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req: any, _res, next) => {
      req.user = mockUser;
      next();
    });
  });

  describe('POST /api/threads', () => {
    it('creates a thread and returns 201', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.create).mockResolvedValue(mockThread as any);

      const res = await request(app)
        .post('/api/threads')
        .send({ name: 'Career Pivot', category: 'career' })
        .expect(201);

      expect(res.body.id).toBe('thread-abc');
      expect(res.body.name).toBe('Career Pivot');
    });

    it('returns 400 on service error', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.create).mockRejectedValue(new Error('Validation failed'));

      await request(app)
        .post('/api/threads')
        .send({ name: 'Bad Thread' })
        .expect(400);
    });
  });

  describe('GET /api/threads', () => {
    it('lists all threads for the user', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.listByUser).mockResolvedValue([mockThread] as any);

      const res = await request(app).get('/api/threads').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe('thread-abc');
    });

    it('filters by category when provided', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.listByUser).mockResolvedValue([mockThread] as any);

      await request(app).get('/api/threads?category=career').expect(200);
      expect(threadService.listByUser).toHaveBeenCalledWith(mockUser.id, { category: 'career' });
    });

    it('ignores invalid category values', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.listByUser).mockResolvedValue([] as any);

      await request(app).get('/api/threads?category=invalid').expect(200);
      expect(threadService.listByUser).toHaveBeenCalledWith(mockUser.id, undefined);
    });
  });

  describe('GET /api/threads/:id', () => {
    it('returns a thread by id', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);

      const res = await request(app).get('/api/threads/thread-abc').expect(200);
      expect(res.body.id).toBe('thread-abc');
    });

    it('returns 404 when thread not found', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.getById).mockResolvedValue(null as any);

      const res = await request(app).get('/api/threads/nonexistent').expect(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe('PATCH /api/threads/:id', () => {
    it('updates a thread and returns it', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const updated = { ...mockThread, name: 'Updated Name' };
      vi.mocked(threadService.update).mockResolvedValue(updated as any);

      const res = await request(app)
        .patch('/api/threads/thread-abc')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
    });

    it('returns 400 on service error', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.update).mockRejectedValue(new Error('Update failed'));

      await request(app)
        .patch('/api/threads/thread-abc')
        .send({ name: 'Bad' })
        .expect(400);
    });
  });

  describe('DELETE /api/threads/:id', () => {
    it('deletes a thread and returns 204', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.delete).mockResolvedValue(undefined as any);

      await request(app).delete('/api/threads/thread-abc').expect(204);
    });

    it('returns 400 on service error', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.delete).mockRejectedValue(new Error('Delete failed'));

      await request(app).delete('/api/threads/thread-abc').expect(400);
    });
  });

  describe('GET /api/threads/:id/timeline', () => {
    it('returns timeline nodes for a thread', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const { threadTimelineService } = await import('../../src/services/threads/threadTimelineService');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);
      vi.mocked(threadTimelineService.getThreadTimeline).mockResolvedValue([
        { id: 'node-1', title: 'First milestone' },
      ] as any);

      const res = await request(app).get('/api/threads/thread-abc/timeline').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe('node-1');
    });

    it('returns 404 when thread not found', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.getById).mockResolvedValue(null as any);

      await request(app).get('/api/threads/bad-id/timeline').expect(404);
    });
  });

  describe('GET /api/threads/:id/interruptions', () => {
    it('returns interruptions for a thread', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const { threadTimelineService } = await import('../../src/services/threads/threadTimelineService');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);
      vi.mocked(threadTimelineService.getThreadInterruptions).mockResolvedValue([] as any);

      const res = await request(app).get('/api/threads/thread-abc/interruptions').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/threads/:id/members', () => {
    it('adds a member and returns 201', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const { threadMembershipService } = await import('../../src/services/threads/threadMembershipService');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);
      vi.mocked(threadMembershipService.addMembership).mockResolvedValue({ id: 'mem-1' } as any);

      const res = await request(app)
        .post('/api/threads/thread-abc/members')
        .send({ node_id: 'node-uuid-1111-1111-1111-111111111111', node_type: 'arc' })
        .expect(201);

      expect(res.body.id).toBe('mem-1');
    });

    it('returns 404 when thread not found', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.getById).mockResolvedValue(null as any);

      await request(app)
        .post('/api/threads/bad-id/members')
        .send({ node_id: 'node-uuid-1111-1111-1111-111111111111', node_type: 'arc' })
        .expect(404);
    });
  });

  describe('DELETE /api/threads/:id/members', () => {
    it('removes a member by body and returns 204', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const { threadMembershipService } = await import('../../src/services/threads/threadMembershipService');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);
      vi.mocked(threadMembershipService.removeMembership).mockResolvedValue(undefined as any);

      await request(app)
        .delete('/api/threads/thread-abc/members')
        .send({ node_id: 'node-uuid-1111-1111-1111-111111111111', node_type: 'arc' })
        .expect(204);
    });
  });

  describe('POST /api/threads/:id/entries', () => {
    it('links an entry to a thread and returns 201', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      const { supabaseAdmin } = await import('../../src/services/supabaseClient');
      vi.mocked(threadService.getById).mockResolvedValue(mockThread as any);

      // entry lookup
      const entryChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'entry-abc', user_id: 'user-123' },
          error: null,
        }),
      };
      // insert link
      const insertChain = {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      vi.mocked(supabaseAdmin.from)
        .mockReturnValueOnce(entryChain as any)
        .mockReturnValueOnce(insertChain as any);

      const res = await request(app)
        .post('/api/threads/thread-abc/entries')
        .send({ entry_id: 'entry-abc' })
        .expect(201);

      expect(res.body.entry_id).toBe('entry-abc');
      expect(res.body.thread_id).toBe('thread-abc');
    });

    it('returns 404 when thread not found', async () => {
      const { threadService } = await import('../../src/services/threads/threadService');
      vi.mocked(threadService.getById).mockResolvedValue(null as any);

      await request(app)
        .post('/api/threads/bad-id/entries')
        .send({ entry_id: 'entry-abc' })
        .expect(404);
    });
  });

  describe('GET /api/threads/nodes/:nodeType/:nodeId/context', () => {
    it('returns thread context for a valid node type', async () => {
      const { threadMembershipService } = await import('../../src/services/threads/threadMembershipService');
      const { nodeRelationService } = await import('../../src/services/threads/nodeRelationService');

      vi.mocked(threadMembershipService.getMembershipsForNode).mockResolvedValue([] as any);
      vi.mocked(nodeRelationService.listByNode).mockResolvedValue({ incoming: [], outgoing: [] } as any);

      const res = await request(app)
        .get('/api/threads/nodes/arc/node-123/context')
        .expect(200);

      expect(res.body).toHaveProperty('threads');
      expect(res.body).toHaveProperty('relations');
    });

    it('returns 400 for invalid node type', async () => {
      const res = await request(app)
        .get('/api/threads/nodes/invalid/node-123/context')
        .expect(400);

      expect(res.body.error).toMatch(/saga or arc/i);
    });
  });

  describe('Node relations', () => {
    it('POST /api/threads/node-relations creates a relation', async () => {
      const { nodeRelationService } = await import('../../src/services/threads/nodeRelationService');
      vi.mocked(nodeRelationService.create).mockResolvedValue({ id: 'rel-1' } as any);

      const res = await request(app)
        .post('/api/threads/node-relations')
        .send({
          from_node_id: 'aaaa-1111-1111-1111-111111111111',
          from_node_type: 'saga',
          to_node_id: 'bbbb-2222-2222-2222-222222222222',
          to_node_type: 'arc',
          relation_type: 'influenced_by',
        })
        .expect(201);

      expect(res.body.id).toBe('rel-1');
    });

    it('GET /api/threads/node-relations lists all relations', async () => {
      const { nodeRelationService } = await import('../../src/services/threads/nodeRelationService');
      vi.mocked(nodeRelationService.listByUser).mockResolvedValue([] as any);

      const res = await request(app).get('/api/threads/node-relations').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE /api/threads/node-relations/:relationId removes a relation', async () => {
      const { nodeRelationService } = await import('../../src/services/threads/nodeRelationService');
      vi.mocked(nodeRelationService.delete).mockResolvedValue(undefined as any);

      await request(app).delete('/api/threads/node-relations/rel-123').expect(204);
    });
  });
});
