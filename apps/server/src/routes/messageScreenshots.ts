import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { characterMessageMediaService } from '../services/characters/characterMessageMediaService';

const router = Router();

/**
 * POST /api/messages/screenshot
 * Upload a DM/text-message screenshot from chat; AI extracts transcript and assigns to character.
 */
router.post(
  '/screenshot',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      dataUrl: z.string(),
      characterId: z.string().uuid().optional(),
      characterName: z.string().optional(),
      caption: z.string().optional(),
      source: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { dataUrl, characterId, characterName, caption, source } = parsed.data;

    let resolved = await characterMessageMediaService.resolveCharacterForUpload(
      userId,
      characterId,
      characterName,
    );

    if (!resolved && characterName) {
      return res.status(404).json({
        error: 'character_not_found',
        message: `No character found matching "${characterName}". Create them in Characters first or pass characterId.`,
      });
    }

    if (!resolved) {
      const { characterMessageAnalysisService } = await import(
        '../services/characters/characterMessageAnalysisService'
      );
      const b64Match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
      if (!b64Match) return res.status(400).json({ error: 'Invalid image data URL' });
      const buffer = Buffer.from(b64Match[2], 'base64');
      const analysis = await characterMessageAnalysisService.analyzeScreenshot(buffer, 'screenshot.jpg', {
        userId,
        caption,
      });
      if (analysis.counterpartCharacterId) {
        resolved = await characterMessageMediaService.resolveCharacterForUpload(
          userId,
          analysis.counterpartCharacterId,
          analysis.counterpartName,
        );
      }
      if (!resolved) {
        return res.status(422).json({
          error: 'character_unresolved',
          message: 'Could not determine who this conversation is with. Pass characterId or create the person first.',
          analysis,
        });
      }
    }

    const saved = await characterMessageMediaService.saveMessageMedia({
      userId,
      characterId: resolved.id,
      characterName: resolved.name,
      dataUrl,
      caption,
      source: source ?? 'chat',
      analyzeImage: true,
    });

    if (!saved) {
      logger.error({ userId, characterId: resolved.id }, 'message screenshot save failed');
      return res.status(500).json({ error: 'Could not save message screenshot' });
    }

    res.json({
      media: saved,
      character: resolved,
      message: `Saved message screenshot for ${resolved.name}`,
    });
  }),
);

export default router;
