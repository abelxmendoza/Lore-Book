import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { personaService } from '../services/personaService';

const router = Router();

const updateSchema = z.object({
  version: z.string().optional(),
  motifs: z.array(z.string()).optional(),
  toneProfile: z.record(z.string()).optional(),
  behavioralBiases: z.record(z.any()).optional(),
  emotionalVector: z.record(z.any()).optional(),
  description: z.string().optional()
});

router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const persona = personaService.getPersona(req.user!.id);
  const history = personaService.history(req.user!.id);
  res.json({ persona, history });
});

router.post('/update', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const persona = personaService.updatePersona(req.user!.id, parsed.data);
  res.json({ persona });
});

router.get('/description', requireAuth, (req: AuthenticatedRequest, res) => {
  const persona = personaService.getPersona(req.user!.id);
  const lines = [
    `Persona: ${persona.version}`,
    `Motifs: ${persona.motifs.join(', ')}`,
    `Tone: ${JSON.stringify(persona.toneProfile)}`,
    persona.description,
  ];
  res.json({ description: lines.join('\n') });
});

export const personaRouter = router;
