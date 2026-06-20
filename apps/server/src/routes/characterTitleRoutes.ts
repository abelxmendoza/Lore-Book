import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { characterTitleService } from '../services/identity/characterTitlePersistenceService';

const router = Router({ mergeParams: true });

const patchTitleSchema = z.object({
  primaryTitle: z.string().min(1).max(200),
  characterSubtitle: z.string().max(500).optional(),
  stability: z.enum(['locked', 'stable', 'suggested_update', 'temporary', 'needs_resolution']).optional(),
  userConfirmed: z.boolean().optional(),
});

const addAliasSchema = z.object({
  value: z.string().min(1).max(200),
  aliasType: z.enum([
    'nickname',
    'stage_name',
    'middle_name',
    'family_title',
    'role_reference',
    'misspelling',
    'alternate_spelling',
    'old_display_title',
  ]),
});

const resolveReferenceSchema = z.object({
  namedPerson: z.string().min(1).max(200).optional(),
  preferContextualPrimary: z.boolean().optional(),
  subtitle: z.string().max(500).optional(),
  userConfirmed: z.boolean().optional(),
});

router.get('/title', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = req.params.id as string;
  const result = await characterTitleService.getTitle(userId, characterId);
  if (!result) return res.status(404).json({ error: 'Character not found' });
  return res.json(result);
});

router.patch('/title', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = patchTitleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  try {
    const result = await characterTitleService.patchTitle(req.user!.id, req.params.id as string, parsed.data);
    if (!result) return res.status(404).json({ error: 'Character not found' });
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update title';
    return res.status(422).json({ error: msg });
  }
});

router.post('/aliases', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = addAliasSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const result = await characterTitleService.addAlias(req.user!.id, req.params.id as string, parsed.data);
  if (!result) return res.status(404).json({ error: 'Character not found' });
  return res.json({ displayTitle: result });
});

router.post('/aliases/:aliasId/promote', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await characterTitleService.promoteAlias(
      req.user!.id,
      req.params.id as string,
      req.params.aliasId as string
    );
    if (!result) return res.status(404).json({ error: 'Character not found' });
    return res.json({ displayTitle: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Promote failed';
    return res.status(422).json({ error: msg });
  }
});

router.post('/title/lock', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await characterTitleService.lockTitle(req.user!.id, req.params.id as string);
  if (!result) return res.status(404).json({ error: 'Character not found' });
  return res.json({ displayTitle: result });
});

router.post('/resolve-reference', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = resolveReferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const result = await characterTitleService.resolveReference(
    req.user!.id,
    req.params.id as string,
    parsed.data
  );
  if (!result) return res.status(404).json({ error: 'Character not found' });
  return res.json(result);
});

router.post('/suggest-title-update', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await characterTitleService.suggestTitleUpdate(req.user!.id, req.params.id as string);
  if (!result) return res.status(404).json({ error: 'Character not found' });
  return res.json(result);
});

export const characterTitleRoutes = router;
