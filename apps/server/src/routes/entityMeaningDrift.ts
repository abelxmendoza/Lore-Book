import { Router } from 'express';

import { logger } from '../logger';
import { entityMeaningDriftService } from '../services/entityMeaningDriftService';
import type { EntityType } from '../services/entityResolutionService';

const router = Router();

/**
 * GET /api/entity-meaning-drift/timeline/:entityId
 * Get meaning timeline for an entity
 */
router.get('/timeline/:entityId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { entityId } = req.params;
    const entityType = (req.query.entity_type as EntityType) || 'CHARACTER';

    const timeline = await entityMeaningDriftService.getMeaningTimeline(
      userId,
      entityId,
      entityType
    );

    return res.json({ success: true, timeline });
  } catch (error) {
    logger.error({ error }, 'Failed to get meaning timeline');
    return res.status(500).json({ error: 'Failed to get meaning timeline' });
  }
});

/**
 * POST /api/entity-meaning-drift/confirm
 * Confirm a meaning transition
 */
router.post('/confirm', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { transition_id, note } = req.body;

    if (!transition_id) {
      return res.status(400).json({ error: 'transition_id is required' });
    }

    await entityMeaningDriftService.confirmTransition(transition_id, userId, note);

    return res.json({ success: true, message: 'Transition confirmed' });
  } catch (error) {
    logger.error({ error }, 'Failed to confirm transition');
    return res.status(500).json({ error: 'Failed to confirm transition' });
  }
});

/**
 * POST /api/entity-meaning-drift/resolve
 * Resolve a meaning drift prompt from chat
 */
router.post('/resolve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { entity_id, entity_type, action, note } = req.body;

    if (!entity_id || !entity_type || !action) {
      return res.status(400).json({ error: 'entity_id, entity_type, and action are required' });
    }

    // If confirmed, create snapshot and transition
    if (action === 'CONFIRMED') {
      // Detect drift again to get current signal
      const driftSignal = await entityMeaningDriftService.detectMeaningDrift(
        userId,
        entity_id,
        entity_type
      );

      if (driftSignal) {
        // Create new snapshot
        const newSnapshot = await entityMeaningDriftService.createSnapshot(
          userId,
          entity_id,
          entity_type,
          {
            timeframe_start: new Date().toISOString(),
            timeframe_end: null, // Current/ongoing
            dominant_context: driftSignal.detected_shifts.context?.to || null,
            sentiment_mode: driftSignal.detected_shifts.sentiment?.to || null,
            importance_level: driftSignal.detected_shifts.importance?.to || null,
            mention_frequency: driftSignal.evidence.mention_frequency.recent,
            confidence: driftSignal.signal_strength,
            signals: driftSignal.evidence,
            user_note: note || null,
          }
        );

        // Get current snapshot to close it
        const currentSnapshot = await entityMeaningDriftService.getCurrentSnapshot(
          userId,
          entity_id,
          entity_type
        );

        if (currentSnapshot && currentSnapshot.id !== newSnapshot.id) {
          // Close current snapshot
          await entityMeaningDriftService.createSnapshot(
            userId,
            entity_id,
            entity_type,
            {
              ...currentSnapshot,
              timeframe_end: new Date().toISOString(),
            }
          );

          // Create transition
          const transitionType = this.determineTransitionType(driftSignal);
          await entityMeaningDriftService.createTransition(
            userId,
            {
              entity_id,
              entity_type,
              from_snapshot_id: currentSnapshot.id,
              to_snapshot_id: newSnapshot.id,
              transition_type: transitionType,
              user_confirmed: true,
              user_confirmed_at: new Date().toISOString(),
              note: note || null,
              confidence: driftSignal.signal_strength,
              metadata: {},
            }
          );
        }
      }
    }

    return res.json({ success: true, message: 'Drift resolved' });
  } catch (error) {
    logger.error({ error }, 'Failed to resolve meaning drift');
    return res.status(500).json({ error: 'Failed to resolve meaning drift' });
  }
});

/**
 * Helper to determine transition type from drift signal
 */
function determineTransitionType(driftSignal: any): string {
  const shifts = driftSignal.detected_shifts;
  const shiftCount = Object.keys(shifts).length;

  if (shiftCount > 1) return 'MULTIPLE_SHIFTS';
  if (shifts.context) return 'CONTEXT_SHIFT';
  if (shifts.sentiment) return 'SENTIMENT_SHIFT';
  if (shifts.importance) return 'IMPORTANCE_SHIFT';
  return 'MULTIPLE_SHIFTS';
}

export default router;

