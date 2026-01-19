import { Router } from 'express';

import { logger } from '../logger';
import { narrativeDiffEngineService } from '../services/narrativeDiffEngineService';
import type { SensemakingContractType, DiffType, SubjectType } from '../services/narrativeDiffEngineService';

const router = Router();

/**
 * POST /api/narrative-diff/generate
 * Generate narrative diffs from EntryIR records
 */
router.post('/generate', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contract = 'ARCHIVIST' } = req.body;

    if (!['ARCHIVIST', 'ANALYST', 'REFLECTOR'].includes(contract)) {
      return res.status(400).json({ error: 'Invalid contract type' });
    }

    const diffs = await narrativeDiffEngineService.generateDiffsFromIR(
      userId,
      contract as SensemakingContractType
    );

    return res.json({ success: true, diffs, count: diffs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to generate narrative diffs');
    return res.status(500).json({ error: 'Failed to generate narrative diffs' });
  }
});

/**
 * GET /api/narrative-diff/diffs
 * Get narrative diffs for user
 */
router.get('/diffs', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      subject_type,
      subject_id,
      diff_type,
      contract_type,
      limit,
    } = req.query;

    const diffs = await narrativeDiffEngineService.getDiffsForUser(userId, {
      subject_type: subject_type as SubjectType | undefined,
      subject_id: subject_id as string | undefined,
      diff_type: diff_type as DiffType | undefined,
      contract_type: contract_type as SensemakingContractType | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    return res.json({ success: true, diffs, count: diffs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get narrative diffs');
    return res.status(500).json({ error: 'Failed to get narrative diffs' });
  }
});

/**
 * GET /api/narrative-diff/entity/:entityId
 * Get diffs for a specific entity
 */
router.get('/entity/:entityId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { entityId } = req.params;
    const contract = req.query.contract as SensemakingContractType | undefined;

    const diffs = await narrativeDiffEngineService.getDiffsForEntity(
      userId,
      entityId,
      contract
    );

    return res.json({ success: true, diffs, count: diffs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get entity diffs');
    return res.status(500).json({ error: 'Failed to get entity diffs' });
  }
});

/**
 * GET /api/narrative-diff/self
 * Get diffs for self (identity evolution)
 */
router.get('/self', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contract = req.query.contract as SensemakingContractType | undefined;

    const diffs = await narrativeDiffEngineService.getDiffsForSelf(userId, contract);

    return res.json({ success: true, diffs, count: diffs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get self diffs');
    return res.status(500).json({ error: 'Failed to get self diffs' });
  }
});

export default router;

