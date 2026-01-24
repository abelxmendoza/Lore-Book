import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { decisionsRouter } from '../../src/routes/decisions';
import { requireAuth } from '../../src/middleware/auth';
import { decisionMemoryService } from '../../src/services/decisionMemoryService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/decisionMemoryService');

const app = express();
app.use(express.json());
app.use('/api/decisions', decisionsRouter);

describe('Decisions API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/decisions', () => {
    it('should return decisions list', async () => {
      const list = [{ id: 'd1', decision: 'Choose X' }];
      vi.mocked(decisionMemoryService.getDecisions).mockResolvedValue(list as any);

      const response = await request(app).get('/api/decisions').expect(200);
      expect(response.body).toHaveProperty('decisions');
    });
  });

  describe('POST /api/decisions', () => {
    it('should record a decision', async () => {
      const summary = { id: 's1' };
      vi.mocked(decisionMemoryService.recordDecision).mockResolvedValue(summary as any);

      const response = await request(app)
        .post('/api/decisions')
        .send({ decision: 'What to do', options: ['A', 'B'], rationale: 'Because' })
        .expect(200);
      expect(decisionMemoryService.recordDecision).toHaveBeenCalledWith(mockUser.id, 'What to do', ['A', 'B'], 'Because');
    });

    it('should return 400 when required fields missing', async () => {
      await request(app).post('/api/decisions').send({ decision: 'X' }).expect(400);
    });
  });

  describe('POST /api/decisions/propose', () => {
    it('should return proposal', async () => {
      const proposal = { action: 'capture' };
      vi.mocked(decisionMemoryService.proposeDecisionCapture).mockResolvedValue(proposal as any);

      const response = await request(app)
        .post('/api/decisions/propose')
        .send({ message: 'I decided to go' })
        .expect(200);
      expect(response.body).toHaveProperty('proposal');
    });
  });
});
