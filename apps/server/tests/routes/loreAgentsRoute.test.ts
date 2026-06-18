import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const getTraceByMessage = vi.fn();
const getPipelineTrace = vi.fn();

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request & { user?: { id: string } }, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../../src/services/agents/loreAgentRunService', () => ({
  loreAgentRunService: { getTraceByMessage: (...a: unknown[]) => getTraceByMessage(...a) },
}));

vi.mock('../../src/services/agents/loreAgentTools', () => ({
  loreAgentTools: { getPipelineTrace: (...a: unknown[]) => getPipelineTrace(...a) },
}));

import { loreAgentsRouter } from '../../src/routes/loreAgents';

const VALID_ID = '11111111-1111-4111-8111-111111111111';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/lore-agents', loreAgentsRouter);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('GET /api/lore-agents/trace/:messageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTraceByMessage.mockResolvedValue({
      runs: [{ agent_name: 'MemoryAgent', run_id: 'r1', confidence: 0.9 }],
      observations: [{ agent_name: 'MemoryAgent', kind: 'durable_memory_candidate', summary: 'x' }],
      proposedActions: [{ agent_name: 'MemoryAgent', action_type: 'propose_memory_mutation', routed_to: 'memory_review_queue' }],
    });
    getPipelineTrace.mockResolvedValue({ messageId: VALID_ID, phases: ['lexer', 'parser', 'mapper'] });
  });

  it('returns the merged agent trace for a message', async () => {
    const res = await request(makeApp()).get(`/api/lore-agents/trace/${VALID_ID}`).expect(200);

    expect(res.body).toMatchObject({
      messageId: VALID_ID,
      pipeline: { phases: ['lexer', 'parser', 'mapper'] },
    });
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.proposedActions[0].action_type).toBe('propose_memory_mutation');
    expect(getTraceByMessage).toHaveBeenCalledWith('user-1', VALID_ID);
  });

  it('rejects a non-uuid message id', async () => {
    await request(makeApp()).get('/api/lore-agents/trace/not-a-uuid').expect((res) => {
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
    expect(getTraceByMessage).not.toHaveBeenCalled();
  });
});
