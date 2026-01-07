import { Router } from 'express';
import { logger } from '../logger';
import { knowledgeTypeEngineService } from '../services/knowledgeTypeEngineService';
import type { KnowledgeType } from '../services/knowledgeTypeEngineService';

const router = Router();

/**
 * GET /api/knowledge-type/units/:utteranceId
 * Get knowledge units for an utterance
 */
router.get('/units/:utteranceId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { utteranceId } = req.params;
    const units = await knowledgeTypeEngineService.getKnowledgeUnitsForUtterance(
      userId,
      utteranceId
    );

    return res.json({ success: true, units });
  } catch (error) {
    logger.error({ error }, 'Failed to get knowledge units');
    return res.status(500).json({ error: 'Failed to get knowledge units' });
  }
});

/**
 * GET /api/knowledge-type/units
 * Get knowledge units by type
 */
router.get('/units', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const type = req.query.type as KnowledgeType;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!type) {
      return res.status(400).json({ error: 'type query parameter is required' });
    }

    const units = await knowledgeTypeEngineService.getKnowledgeUnitsByType(
      userId,
      type,
      limit
    );

    return res.json({ success: true, units });
  } catch (error) {
    logger.error({ error }, 'Failed to get knowledge units by type');
    return res.status(500).json({ error: 'Failed to get knowledge units by type' });
  }
});

/**
 * POST /api/knowledge-type/classify
 * Classify a text snippet (for testing/debugging)
 */
router.post('/classify', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const type = knowledgeTypeEngineService.classifyKnowledge(text);
    const confidence = knowledgeTypeEngineService.initialConfidence(type, text);
    const source = knowledgeTypeEngineService.inferSource(type);
    const temporalScope = knowledgeTypeEngineService.inferTemporalScope(text);

    return res.json({
      success: true,
      classification: {
        type,
        confidence,
        certainty_source: source,
        temporal_scope: temporalScope,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to classify knowledge');
    return res.status(500).json({ error: 'Failed to classify knowledge' });
  }
});

export default router;

