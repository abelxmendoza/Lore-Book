// =====================================================
// ENTITY RESOLUTION API ROUTES
// Purpose: API endpoints for entity resolution dashboard
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { continuityService } from '../services/continuityService';
import { entityResolutionService } from '../services/entityResolutionService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * POST /api/entity-resolution/disambiguate
 * Handle disambiguation response from user
 */
router.post(
  '/disambiguate',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const schema = z.object({
      mention_text: z.string(),
      action: z.enum(['SELECT_ENTITY', 'CREATE_NEW_ENTITY', 'SKIP']),
      entity_id: z.string().uuid().optional(),
      message_id: z.string().uuid().optional(), // Original message ID for relinking
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    const { mention_text, action, entity_id, message_id } = parsed.data;

    try {
      if (action === 'SELECT_ENTITY' && entity_id) {
        // Get entity type from the entity
        const entities = await entityResolutionService.listEntities(userId, {});
        const entity = entities.find(e => e.entity_id === entity_id);
        
        if (!entity) {
          return res.status(404).json({ success: false, error: 'Entity not found' });
        }

        // Relink ExtractedUnits to the selected entity
        await entityResolutionService.relinkExtractedUnits(
          userId,
          mention_text,
          entity_id,
          entity.entity_type,
          message_id
        );

        // Record continuity event
        await continuityService.emitEvent(userId, {
          type: 'ENTITY_RESOLVED',
          context: {
            mention_text,
            entity_id: entity_id,
            entity_type: entity.entity_type,
            message_id,
          },
          explanation: `User clarified entity reference: "${mention_text}" → ${entity.primary_name}`,
          related_entity_ids: [entity_id],
          initiated_by: 'USER',
          severity: 'INFO',
          reversible: false,
        });

        logger.info({ userId, mention_text, entity_id }, 'User selected entity for disambiguation');
      } else if (action === 'CREATE_NEW_ENTITY') {
        // Create new entity (default to CHARACTER type)
        const newEntity = await entityResolutionService.createEntityFromClarification(
          userId,
          mention_text,
          'CHARACTER' // Could be determined from context
        );

        // Relink ExtractedUnits to the new entity
        await entityResolutionService.relinkExtractedUnits(
          userId,
          mention_text,
          newEntity.entity_id,
          newEntity.entity_type,
          message_id
        );

        // Record continuity event
        await continuityService.emitEvent(userId, {
          type: 'ENTITY_RESOLVED',
          context: {
            mention_text,
            entity_id: newEntity.entity_id,
            entity_type: newEntity.entity_type,
            message_id,
            source: 'USER_CLARIFICATION',
          },
          explanation: `User created new entity: "${mention_text}"`,
          related_entity_ids: [newEntity.entity_id],
          initiated_by: 'USER',
          severity: 'INFO',
          reversible: false,
        });

        logger.info({ userId, mention_text, entityId: newEntity.entity_id }, 'User created new entity from disambiguation');
      } else if (action === 'SKIP') {
        // Skip disambiguation - no action needed, but log it
        logger.debug({ userId, mention_text }, 'User skipped disambiguation');
      }

      res.json({ success: true });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to handle disambiguation');
      res.status(500).json({ success: false, error: 'Failed to process disambiguation' });
    }
  })
);

/**
 * GET /api/entity-resolution/dashboard
 * Get all entity resolution dashboard data
 */
router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const includeSecondary = req.query.include_secondary === 'true';
    const includeTertiary = req.query.include_tertiary === 'true';

    try {
      const data = await entityResolutionService.getEntityResolutionDashboard(userId, {
        include_secondary: includeSecondary,
        include_tertiary: includeTertiary,
      });
      res.json({ success: true, data });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get entity resolution dashboard data');
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
    }
  })
);

/**
 * GET /api/entity-resolution/entities
 * List all entities with tiered loading
 * Query params:
 *   - include_secondary: boolean (default: false) - Include PERSON entities
 *   - include_tertiary: boolean (default: false) - Include CONCEPT and ENTITY types
 */
router.get(
  '/entities',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const includeSecondary = req.query.include_secondary === 'true';
    const includeTertiary = req.query.include_tertiary === 'true';

    try {
      const entities = await entityResolutionService.listEntities(userId, {
        include_secondary: includeSecondary,
        include_tertiary: includeTertiary,
      });
      res.json({ success: true, entities });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list entities');
      res.status(500).json({ success: false, error: 'Failed to fetch entities' });
    }
  })
);

/**
 * GET /api/entity-resolution/conflicts
 * List open entity conflicts
 */
router.get(
  '/conflicts',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const conflicts = await entityResolutionService.listEntityConflicts(userId);
      res.json({ success: true, conflicts });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list conflicts');
      res.status(500).json({ success: false, error: 'Failed to fetch conflicts' });
    }
  })
);

/**
 * GET /api/entity-resolution/merge-history
 * List entity merge history
 */
router.get(
  '/merge-history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const history = await entityResolutionService.listEntityMergeHistory(userId);
      res.json({ success: true, history });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list merge history');
      res.status(500).json({ success: false, error: 'Failed to fetch merge history' });
    }
  })
);

/**
 * POST /api/entity-resolution/merge
 * Merge two entities
 */
router.post(
  '/merge',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const schema = z.object({
      source_id: z.string().uuid(),
      target_id: z.string().uuid(),
      source_type: z.enum(['CHARACTER', 'LOCATION', 'ENTITY', 'ORG', 'CONCEPT', 'PERSON']),
      target_type: z.enum(['CHARACTER', 'LOCATION', 'ENTITY', 'ORG', 'CONCEPT', 'PERSON']),
      reason: z.string().min(1).max(500),
    });

    const { source_id, target_id, source_type, target_type, reason } = schema.parse(req.body);

    try {
      await entityResolutionService.mergeEntities(
        userId,
        source_id,
        target_id,
        source_type,
        target_type,
        reason
      );
      res.json({ success: true, message: 'Entities merged successfully' });
    } catch (error) {
      logger.error({ error, userId, source_id, target_id }, 'Failed to merge entities');
      res.status(500).json({ success: false, error: 'Failed to merge entities' });
    }
  })
);

/**
 * POST /api/entity-resolution/revert-merge/:mergeId
 * Revert an entity merge
 */
router.post(
  '/revert-merge/:mergeId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { mergeId } = req.params;
    const userId = req.user!.id;

    try {
      await entityResolutionService.revertEntityMerge(userId, mergeId);
      res.json({ success: true, message: 'Merge reverted successfully' });
    } catch (error) {
      logger.error({ error, userId, mergeId }, 'Failed to revert merge');
      res.status(500).json({ success: false, error: 'Failed to revert merge' });
    }
  })
);

/**
 * POST /api/entity-resolution/edit
 * Edit an entity manually
 */
router.post(
  '/edit',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const schema = z.object({
      entity_id: z.string().uuid(),
      entity_type: z.enum(['CHARACTER', 'LOCATION', 'ENTITY', 'ORG', 'CONCEPT', 'PERSON']),
      updates: z.object({
        name: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional(),
      }),
    });

    const { entity_id, entity_type, updates } = schema.parse(req.body);

    try {
      await entityResolutionService.editEntity(userId, entity_id, entity_type, updates);
      res.json({ success: true, message: 'Entity edited successfully' });
    } catch (error) {
      logger.error({ error, userId, entity_id, entity_type }, 'Failed to edit entity');
      res.status(500).json({ success: false, error: 'Failed to edit entity' });
    }
  })
);

/**
 * POST /api/entity-resolution/conflicts/:id/dismiss
 * Dismiss a conflict
 */
router.post(
  '/conflicts/:id/dismiss',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
      await entityResolutionService.dismissConflict(userId, id);
      res.json({ success: true, message: 'Conflict dismissed successfully' });
    } catch (error) {
      logger.error({ error, userId, conflictId: id }, 'Failed to dismiss conflict');
      res.status(500).json({ success: false, error: 'Failed to dismiss conflict' });
    }
  })
);

export default router;

