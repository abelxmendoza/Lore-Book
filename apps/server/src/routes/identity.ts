import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emitDelta } from '../realtime/orchestratorEmitter';
import { personaService } from '../services/personaService';

const router = Router();

const recomputeSchema = z.object({
  description: z.string().optional(),
  motifs: z.array(z.string()).optional(),
  toneProfile: z.record(z.any()).optional(),
  behavioralBiases: z.record(z.any()).optional(),
  emotionalVector: z.record(z.any()).optional(),
  version: z.string().optional()
});

router.get('/pulse', requireAuth, (req: AuthenticatedRequest, res) => {
  const snapshot = personaService.getPersona(req.user!.id);
  const pulse = {
    persona: snapshot.version,
    motifs: snapshot.motifs.map((name) => ({ name, energy: 0.75 })),
    emotionTrajectory: [{ label: 'stability', value: 0.8 }],
    stability: 0.9,
    driftWarnings: [],
  };

  res.json({ pulse });
});

router.post('/recompute', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = recomputeSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const snapshot = personaService.updatePersona(req.user!.id, parsed.data);
  void emitDelta('identity.update', { snapshot }, req.user!.id);
  res.json({ snapshot });
});

export const identityRouter = router;
