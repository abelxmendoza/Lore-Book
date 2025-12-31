import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';
import { embeddingService } from '../services/embeddingService';

const router = Router();

/**
 * POST /api/entities/auto-update
 * Auto-detect and update entities from conversation
 */
router.post(
  '/auto-update',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entity_type, entity_id, conversation } = req.body;

    if (!entity_type || !entity_id || !conversation) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const { user_message, assistant_message } = conversation;
      const combinedText = `${user_message} ${assistant_message}`;

      // Extract entities from conversation
      const detectedEntities = await extractEntities(combinedText, req.user!.id);

      // Update the main entity based on conversation
      if (entity_type === 'character') {
        await updateCharacterFromConversation(req.user!.id, entity_id, combinedText, detectedEntities);
      } else if (entity_type === 'location') {
        await updateLocationFromConversation(req.user!.id, entity_id, combinedText, detectedEntities);
      } else if (entity_type === 'memory') {
        await updateMemoryFromConversation(req.user!.id, entity_id, combinedText, detectedEntities);
      }

      // Create/update related entities mentioned in conversation
      for (const entity of detectedEntities) {
        if (entity.type === 'character') {
          await ensureCharacterExists(req.user!.id, entity.name, combinedText);
        } else if (entity.type === 'location') {
          await ensureLocationExists(req.user!.id, entity.name, combinedText);
        }
      }

      res.json({
        updated: true,
        entities: detectedEntities
      });
    } catch (error) {
      logger.error({ error }, 'Error auto-updating entities');
      res.status(500).json({ error: 'Failed to update entities' });
    }
  })
);

/**
 * Extract entities from text
 */
async function extractEntities(text: string, userId: string): Promise<Array<{ name: string; type: 'character' | 'location' }>> {
  const entities: Array<{ name: string; type: 'character' | 'location' }> = [];

  // Simple pattern-based extraction (can be enhanced with AI)
  // Character patterns
  const characterPatterns = [
    /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Full names
    /\b([A-Z][a-z]+)\b/g // Capitalized words
  ];

  // Location patterns
  const locationPatterns = [
    /\b(?:in|at|to|from|near|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    /\b([A-Z][a-z]+ (?:Street|Avenue|Road|Park|Beach|City|State|Country))\b/g
  ];

  for (const pattern of characterPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = (match[1] || match[0]).trim();
      if (name.length > 2 && !entities.find(e => e.name === name)) {
        entities.push({ name, type: 'character' });
      }
    }
  }

  for (const pattern of locationPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = (match[1] || match[0]).trim();
      if (name.length > 2 && !entities.find(e => e.name === name)) {
        entities.push({ name, type: 'location' });
      }
    }
  }

  return entities;
}

/**
 * Update character from conversation
 */
async function updateCharacterFromConversation(
  userId: string,
  characterId: string,
  conversationText: string,
  detectedEntities: Array<{ name: string; type: string }>
) {
  // Extract character info from conversation
  const summary = conversationText.substring(0, 500);
  
  // Get embedding for semantic search
  const embedding = await embeddingService.embedText(conversationText);

  await supabaseAdmin
    .from('characters')
    .update({
      summary: summary,
      embedding: embedding,
      updated_at: new Date().toISOString()
    })
    .eq('id', characterId)
    .eq('user_id', userId);
}

/**
 * Update location from conversation
 */
async function updateLocationFromConversation(
  userId: string,
  locationId: string,
  conversationText: string,
  detectedEntities: Array<{ name: string; type: string }>
) {
  const description = conversationText.substring(0, 500);
  const embedding = await embeddingService.embedText(conversationText);

  await supabaseAdmin
    .from('locations')
    .update({
      description: description,
      embedding: embedding,
      updated_at: new Date().toISOString()
    })
    .eq('id', locationId)
    .eq('user_id', userId);
}

/**
 * Update memory from conversation
 */
async function updateMemoryFromConversation(
  userId: string,
  memoryId: string,
  conversationText: string,
  detectedEntities: Array<{ name: string; type: string }>
) {
  // Extract tags and metadata
  const tags: string[] = [];
  detectedEntities.forEach(entity => {
    if (entity.type === 'character' || entity.type === 'location') {
      tags.push(entity.name.toLowerCase());
    }
  });

  await supabaseAdmin
    .from('journal_entries')
    .update({
      tags: tags,
      updated_at: new Date().toISOString()
    })
    .eq('id', memoryId)
    .eq('user_id', userId);
}

/**
 * Ensure character exists, create if not
 */
async function ensureCharacterExists(userId: string, name: string, context: string) {
  const { data: existing } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .single();

  if (!existing) {
    const embedding = await embeddingService.embedText(name);
    await supabaseAdmin
      .from('characters')
      .insert({
        user_id: userId,
        name: name,
        summary: `Mentioned in: ${context.substring(0, 200)}`,
        embedding: embedding
      });
  }
}

/**
 * Ensure location exists, create if not
 */
async function ensureLocationExists(userId: string, name: string, context: string) {
  const normalizedName = name.toLowerCase().trim();
  
  const { data: existing } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('user_id', userId)
    .eq('normalized_name', normalizedName)
    .single();

  if (!existing) {
    const embedding = await embeddingService.embedText(name);
    await supabaseAdmin
      .from('locations')
      .insert({
        user_id: userId,
        name: name,
        normalized_name: normalizedName,
        description: `Mentioned in: ${context.substring(0, 200)}`,
        embedding: embedding
      });
  }
}

export default router;
