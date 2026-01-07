import { Router } from 'express';
import { logger } from '../logger';
import { entityAmbiguityService } from '../services/entityAmbiguityService';
import { entityResolutionService } from '../services/entityResolutionService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * POST /api/entity-ambiguity/resolve
 * Resolve an entity ambiguity by selecting a candidate or creating a new entity
 */
router.post('/resolve', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message_id, surface_text, chosen_entity_id, chosen_entity_name, create_new } = req.body;

    if (!surface_text) {
      return res.status(400).json({ error: 'surface_text is required' });
    }

    // If creating a new entity
    if (create_new) {
      // Create new entity (you may want to enhance this with more context)
      // For now, we'll just record the resolution preference
      logger.info({ userId, surface_text }, 'User chose to create new entity for ambiguity');
      
      // TODO: Trigger entity creation flow if needed
      return res.json({ 
        success: true, 
        message: 'New entity will be created',
        action: 'CREATE_NEW'
      });
    }

    // If selecting an existing entity
    if (!chosen_entity_id) {
      return res.status(400).json({ error: 'chosen_entity_id is required when not creating new' });
    }

    // Record the resolution
    // This helps boost confidence for the chosen entity in future mentions
    logger.info({ 
      userId, 
      surface_text, 
      chosen_entity_id,
      chosen_entity_name 
    }, 'Entity ambiguity resolved');

    // Boost confidence for chosen entity (optional - can be done in background)
    // For now, we'll just log it. You can enhance this to:
    // 1. Add alias mapping (surface_text -> chosen_entity)
    // 2. Update entity confidence
    // 3. Re-run ingestion for the message if needed

    // Add alias if it doesn't exist
    try {
      const entities = await entityResolutionService.listEntities(userId, {});
      const chosenEntity = entities.find(e => e.entity_id === chosen_entity_id);
      
      if (chosenEntity && !chosenEntity.aliases.includes(surface_text)) {
        // Update entity with new alias
        await entityResolutionService.editEntity(chosen_entity_id, {
          aliases: [...chosenEntity.aliases, surface_text]
        });
      }
    } catch (error) {
      logger.warn({ error, chosen_entity_id }, 'Failed to update entity alias');
    }

    return res.json({ 
      success: true, 
      message: 'Entity ambiguity resolved',
      action: 'SELECT_ENTITY',
      entity_id: chosen_entity_id
    });
  } catch (error) {
    logger.error({ error }, 'Failed to resolve entity ambiguity');
    return res.status(500).json({ error: 'Failed to resolve entity ambiguity' });
  }
});

export default router;

