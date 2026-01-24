import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { agentsRouter } from '../../src/routes/agents';
import { requireAuth } from '../../src/middleware/auth';
import { agentService } from '../../src/services/agentService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/agentService', () => ({
  agentService: {
    listAgents: vi.fn(),
    runAgent: vi.fn(),
    runAllAgents: vi.fn(),
  },
}));
vi.mock('../../src/realtime/orchestratorEmitter', () => ({
  emitDelta: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/agents', agentsRouter);

describe('Agents API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/agents/status', () => {
    it('should return agent status', async () => {
      vi.mocked(agentService.listAgents).mockResolvedValue({ agents: [] } as any);

      const response = await request(app).get('/api/agents/status').expect(200);
      expect(agentService.listAgents).toHaveBeenCalled();
    });
  });
});
