import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';
import { characterAvatarUrl, avatarStyleFor } from '../utils/avatar';
import { cacheAvatar } from '../utils/cacheAvatar';
import { config } from '../config';

const router = Router();

const createCharacterSchema = z.object({
  name: z.string().min(1),
  alias: z.array(z.string()).optional(),
  pronouns: z.string().optional(),
  archetype: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  social_media: z
    .object({
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      facebook: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      website: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

const updateCharacterSchema = z.object({
  name: z.string().optional(),
  alias: z.array(z.string()).optional(),
  pronouns: z.string().optional(),
  archetype: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  social_media: z
    .object({
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      facebook: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      website: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional()
    })
    .optional(),
  metadata: z.record(z.unknown()).optional()
});

/**
 * @swagger
 * /api/characters:
 *   post:
 *     summary: Create a new character
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               alias:
 *                 type: array
 *                 items:
 *                   type: string
 *               pronouns:
 *                 type: string
 *               archetype:
 *                 type: string
 *               role:
 *                 type: string
 *               status:
 *                 type: string
 *               summary:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               social_media:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Character created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid character data', details: parsed.error.flatten() });
    }

    const characterData = parsed.data;
    const userId = req.user!.id;
    const id = randomUUID();

    // Determine avatar style based on character type/archetype
    const style = avatarStyleFor(characterData.archetype || characterData.role);
    const dicebearUrl = characterAvatarUrl(id, style);

    // Try to cache avatar (optional - failures are handled gracefully)
    let avatarUrl = dicebearUrl;
    try {
      avatarUrl = await cacheAvatar(id, dicebearUrl);
    } catch (error) {
      logger.warn({ error, characterId: id }, 'Avatar caching failed, using direct URL');
    }

    // Merge social_media into metadata
    const metadata: Record<string, unknown> = {
      ...(characterData.metadata || {}),
      ...(characterData.social_media ? { social_media: characterData.social_media } : {})
    };

    // Insert character with avatar
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .insert({
        id,
        user_id: userId,
        name: characterData.name,
        alias: characterData.alias || [],
        pronouns: characterData.pronouns || null,
        archetype: characterData.archetype || null,
        role: characterData.role || null,
        status: characterData.status || 'active',
        summary: characterData.summary || null,
        tags: characterData.tags || [],
        avatar_url: avatarUrl,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      // Handle unique constraint violation (user_id, name)
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Character with this name already exists' });
      }
      logger.error({ err: error }, 'Failed to create character');
      return res.status(500).json({ error: 'Failed to create character' });
    }

    res.status(201).json({ character });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create character');
    res.status(500).json({ error: 'Failed to create character' });
  }
});

/**
 * @swagger
 * /api/characters/list:
 *   get:
 *     summary: List all characters
 *     tags: [Characters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of characters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 characters:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Character'
 *       500:
 *         description: Server error
 */
router.get('/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Try to get from characters table first (new system)
    const { data: charactersData, error: charactersError } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    // If table doesn't exist or is empty, return empty array
    if (charactersError) {
      // Check if it's a "relation does not exist" error
      if (charactersError.code === '42P01' || charactersError.message?.includes('does not exist')) {
        logger.warn('Characters table does not exist yet, returning empty list');
        return res.json({ characters: [] });
      }
      throw charactersError;
    }

    if (charactersData && charactersData.length > 0) {
      const characterIds = charactersData.map(c => c.id);

      // Batch query memory counts for all characters (ONE query instead of N)
      const { data: memoryCountsData } = await supabaseAdmin
        .from('character_memories')
        .select('character_id')
        .in('character_id', characterIds);

      const memoryCounts = new Map<string, number>();
      memoryCountsData?.forEach(mem => {
        memoryCounts.set(mem.character_id, (memoryCounts.get(mem.character_id) || 0) + 1);
      });

      // Batch query relationships for all characters (ONE query instead of N)
      const { data: allRelationships } = await supabaseAdmin
        .from('character_relationships')
        .select('*')
        .or(`source_character_id.in.(${characterIds.join(',')}),target_character_id.in.(${characterIds.join(',')})`);

      // Group relationships by character
      const relationshipsByCharacter = new Map<string, typeof allRelationships>();
      const relationshipCounts = new Map<string, number>();
      
      allRelationships?.forEach(rel => {
        // Add to source character
        if (!relationshipsByCharacter.has(rel.source_character_id)) {
          relationshipsByCharacter.set(rel.source_character_id, []);
        }
        relationshipsByCharacter.get(rel.source_character_id)!.push(rel);
        relationshipCounts.set(rel.source_character_id, (relationshipCounts.get(rel.source_character_id) || 0) + 1);

        // Add to target character
        if (!relationshipsByCharacter.has(rel.target_character_id)) {
          relationshipsByCharacter.set(rel.target_character_id, []);
        }
        relationshipsByCharacter.get(rel.target_character_id)!.push(rel);
        relationshipCounts.set(rel.target_character_id, (relationshipCounts.get(rel.target_character_id) || 0) + 1);
      });

      // Get all unique character IDs from relationships
      const relatedCharacterIds = new Set<string>();
      allRelationships?.forEach(rel => {
        relatedCharacterIds.add(rel.source_character_id);
        relatedCharacterIds.add(rel.target_character_id);
      });

      // Batch query character names (ONE query instead of N)
      const { data: relatedCharacters } = relatedCharacterIds.size > 0
        ? await supabaseAdmin
            .from('characters')
            .select('id, name')
            .in('id', Array.from(relatedCharacterIds))
        : { data: [] };

      const characterNameMap = new Map(
        relatedCharacters?.map((c) => [c.id, c.name]) || []
      );

      // Batch query memories for all characters (ONE query instead of N)
      const { data: allMemories } = await supabaseAdmin
        .from('character_memories')
        .select('id, character_id, journal_entry_id, created_at, summary')
        .in('character_id', characterIds)
        .order('created_at', { ascending: false });

      // Group memories by character
      const memoriesByCharacter = new Map<string, typeof allMemories>();
      allMemories?.forEach(mem => {
        if (!memoriesByCharacter.has(mem.character_id)) {
          memoriesByCharacter.set(mem.character_id, []);
        }
        const charMemories = memoriesByCharacter.get(mem.character_id)!;
        if (charMemories.length < 20) { // Limit to 20 per character
          charMemories.push(mem);
        }
      });

      // Map results back to characters (in-memory operation - FAST)
      const charactersWithStats = charactersData.map((char) => {
        // Extract social_media from metadata if it exists
        const metadata = (char.metadata || {}) as Record<string, unknown>;
        const social_media = metadata.social_media as Record<string, string> | undefined;

        const relationships = relationshipsByCharacter.get(char.id) || [];
        const memories = memoriesByCharacter.get(char.id) || [];

        return {
          id: char.id,
          name: char.name,
          alias: char.alias || [],
          pronouns: char.pronouns,
          archetype: char.archetype,
          role: char.role,
          status: char.status || 'active',
          first_appearance: char.first_appearance,
          summary: char.summary,
          tags: char.tags || [],
          avatar_url: char.avatar_url || null,
          social_media: social_media || undefined,
          metadata: metadata,
          created_at: char.created_at,
          updated_at: char.updated_at,
          memory_count: memoryCounts.get(char.id) || 0,
          relationship_count: relationshipCounts.get(char.id) || 0,
          relationships: relationships.slice(0, 50).map((rel) => {
            const relatedCharId = rel.source_character_id === char.id ? rel.target_character_id : rel.source_character_id;
            return {
              id: rel.id,
              character_id: relatedCharId,
              character_name: characterNameMap.get(relatedCharId) || 'Unknown',
              relationship_type: rel.relationship_type,
              closeness_score: rel.closeness_score,
              summary: rel.summary,
              status: rel.status
            };
          }),
          shared_memories: memories.map((mem) => ({
            id: mem.id,
            entry_id: mem.journal_entry_id,
            date: mem.created_at,
            summary: mem.summary || undefined
          }))
        };
      });

      return res.json({ characters: charactersWithStats });
    }

    // If no characters found, return empty array
    if (!charactersData || charactersData.length === 0) {
      return res.json({ characters: [] });
    }

    // Fallback to people_places table (legacy system) - only if characters table is truly empty
    try {
      const people = await peoplePlacesService.listEntities(req.user!.id, 'person');
      const characters = people.map((person) => ({
        id: person.id,
        name: person.name,
        alias: person.corrected_names || [],
        pronouns: undefined,
        archetype: undefined,
        role: undefined,
        status: 'active',
        first_appearance: person.first_mentioned_at,
        summary: undefined,
        tags: [],
        metadata: {},
        created_at: person.first_mentioned_at,
        updated_at: person.last_mentioned_at,
        memory_count: person.total_mentions,
        relationship_count: Object.values(person.relationship_counts || {}).reduce((a, b) => a + b, 0)
      }));
      return res.json({ characters });
    } catch (legacyError) {
      // If legacy system also fails, just return empty array
      logger.warn({ error: legacyError }, 'Legacy people_places fallback failed, returning empty characters');
      return res.json({ characters: [] });
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to list characters');
    // Return empty array instead of error - better UX
    res.json({ characters: [] });
  }
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data: character, error } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id)
      .single();

    if (error || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Get relationships
    const { data: relationships } = await supabaseAdmin
      .from('character_relationships')
      .select('*')
      .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

    // Get character names for relationships
    const relationshipCharacterIds = new Set<string>();
    relationships?.forEach((rel) => {
      if (rel.source_character_id === character.id) {
        relationshipCharacterIds.add(rel.target_character_id);
      } else {
        relationshipCharacterIds.add(rel.source_character_id);
      }
    });

    const { data: relatedCharacters } = relationshipCharacterIds.size > 0
      ? await supabaseAdmin
          .from('characters')
          .select('id, name')
          .in('id', Array.from(relationshipCharacterIds))
      : { data: [] };

    const characterNameMap = new Map(
      relatedCharacters?.map((char) => [char.id, char.name]) || []
    );

    // Get shared memories
    const { data: memories } = await supabaseAdmin
      .from('character_memories')
      .select('id, journal_entry_id, created_at, summary')
      .eq('character_id', character.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const { count: memoryCount } = await supabaseAdmin
      .from('character_memories')
      .select('*', { count: 'exact', head: true })
      .eq('character_id', character.id);

    const { count: relationshipCount } = await supabaseAdmin
      .from('character_relationships')
      .select('*', { count: 'exact', head: true })
      .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

    const metadata = (character.metadata || {}) as Record<string, unknown>;
    const social_media = metadata.social_media as Record<string, string> | undefined;

    res.json({
      id: character.id,
      name: character.name,
      alias: character.alias || [],
      pronouns: character.pronouns,
      archetype: character.archetype,
      role: character.role,
      status: character.status || 'active',
      first_appearance: character.first_appearance,
      summary: character.summary,
      tags: character.tags || [],
      avatar_url: character.avatar_url || null,
      social_media: social_media || undefined,
      metadata: metadata,
      created_at: character.created_at,
      updated_at: character.updated_at,
      memory_count: memoryCount || 0,
      relationship_count: relationshipCount || 0,
      relationships: relationships?.map((rel) => {
        const relatedCharId = rel.source_character_id === character.id ? rel.target_character_id : rel.source_character_id;
        return {
          id: rel.id,
          character_id: relatedCharId,
          character_name: characterNameMap.get(relatedCharId) || 'Unknown',
          relationship_type: rel.relationship_type,
          closeness_score: rel.closeness_score,
          summary: rel.summary,
          status: rel.status
        };
      }) || [],
      shared_memories: memories?.map((mem) => ({
        id: mem.id,
        entry_id: mem.journal_entry_id,
        date: mem.created_at,
        summary: mem.summary || undefined
      })) || []
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get character');
    res.status(500).json({ error: 'Failed to load character' });
  }
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid character data', details: parsed.error.flatten() });
    }

    const updateData = parsed.data;
    const userId = req.user!.id;

    // Check if character exists and belongs to user
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Merge social_media into metadata
    const existingMetadata = (existing.metadata || {}) as Record<string, unknown>;
    const updatedMetadata = {
      ...existingMetadata,
      ...(updateData.metadata || {}),
      ...(updateData.social_media ? { social_media: updateData.social_media } : {})
    };

    // Prepare update payload
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (updateData.name !== undefined) payload.name = updateData.name;
    if (updateData.alias !== undefined) payload.alias = updateData.alias;
    if (updateData.pronouns !== undefined) payload.pronouns = updateData.pronouns;
    if (updateData.archetype !== undefined) payload.archetype = updateData.archetype;
    if (updateData.role !== undefined) payload.role = updateData.role;
    if (updateData.status !== undefined) payload.status = updateData.status;
    if (updateData.summary !== undefined) payload.summary = updateData.summary;
    if (updateData.tags !== undefined) payload.tags = updateData.tags;
    payload.metadata = updatedMetadata;

    const { data: updated, error } = await supabaseAdmin
      .from('characters')
      .update(payload)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error({ err: error }, 'Failed to update character');
      return res.status(500).json({ error: 'Failed to update character' });
    }

    res.json({ character: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update character');
    res.status(500).json({ error: 'Failed to update character' });
  }
});

/**
 * Extract character information from chat message
 */
router.post('/extract-from-chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const openai = new OpenAI({ apiKey: config.openAiKey });

    // Use OpenAI to extract character information
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract character information from the user's message. Look for:
- Names of people mentioned
- Their roles, relationships, or archetypes
- Any descriptive information about them
- Pronouns if mentioned

Return JSON:
{
  "characters": [
    {
      "name": "string (required)",
      "alias": ["string"] (optional),
      "pronouns": "string" (optional),
      "archetype": "string" (optional, e.g., "friend", "mentor", "family", "colleague"),
      "role": "string" (optional),
      "summary": "string" (optional, brief description),
      "tags": ["string"] (optional)
    }
  ]
}

Only extract characters that are clearly mentioned. Skip generic references like "my friend" without a name.
If no characters are found, return {"characters": []}.`
        },
        {
          role: 'user',
          content: message
        }
      ]
    });

    const response = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(response) as { characters?: any[] };

    const characters = Array.isArray(parsed.characters) ? parsed.characters : [];

    // Validate and clean character data
    const validatedCharacters = characters
      .filter(char => char.name && typeof char.name === 'string' && char.name.trim().length > 0)
      .map(char => ({
        name: char.name.trim(),
        alias: Array.isArray(char.alias) ? char.alias.filter((a: any) => typeof a === 'string').map((a: string) => a.trim()) : [],
        pronouns: typeof char.pronouns === 'string' ? char.pronouns.trim() : undefined,
        archetype: typeof char.archetype === 'string' ? char.archetype.trim() : undefined,
        role: typeof char.role === 'string' ? char.role.trim() : undefined,
        summary: typeof char.summary === 'string' ? char.summary.trim() : undefined,
        tags: Array.isArray(char.tags) ? char.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.trim()) : [],
        status: 'active'
      }));

    res.json({ characters: validatedCharacters });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract characters from chat');
    res.status(500).json({ error: 'Failed to extract characters' });
  }
});

export const charactersRouter = router;
