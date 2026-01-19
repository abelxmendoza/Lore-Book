import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitDelta } from '../realtime/orchestratorEmitter';
import { agentService } from '../services/agentService';

const router = Router();

router.use(requireAuth);

router.get('/status', async (_req: AuthenticatedRequest, res) => {
  try {
    const data = await agentService.listAgents();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to load agent status' });
  }
});

router.post('/run/:name', async (req: AuthenticatedRequest, res) => {
  try {
    const data = await agentService.runAgent(req.params.name);
    void emitDelta('agent.run', { name: req.params.name, result: data }, req.user!.id);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run agent';
    res.status(message.includes('Unknown agent') ? 404 : 500).json({ error: message });
  }
});

router.post('/run-all', async (_req: AuthenticatedRequest, res) => {
  try {
    const data = await agentService.runAllAgents();
    void emitDelta('agent.run', { name: 'all', result: data }, _req.user!.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to run all agents' });
  }
});

export const agentsRouter = router;
