import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { peoplePlacesService } from '../services/peoplePlacesService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

const router = Router();

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

router.get('/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Try to get from characters table first (new system)
    const { data: charactersData, error: charactersError } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (!charactersError && charactersData && charactersData.length > 0) {
      // Get memory counts and relationship counts for each character
      const charactersWithStats = await Promise.all(
        charactersData.map(async (char) => {
          const { count: memoryCount } = await supabaseAdmin
            .from('character_memories')
            .select('*', { count: 'exact', head: true })
            .eq('character_id', char.id);

          const { count: relationshipCount } = await supabaseAdmin
            .from('character_relationships')
            .select('*', { count: 'exact', head: true })
            .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`);

          // Extract social_media from metadata if it exists
          const metadata = (char.metadata || {}) as Record<string, unknown>;
          const social_media = metadata.social_media as Record<string, string> | undefined;

          // Get relationships
          const { data: relationships } = await supabaseAdmin
            .from('character_relationships')
            .select('*')
            .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`)
            .limit(50);

          // Get character names for relationships
          const relationshipCharacterIds = new Set<string>();
          relationships?.forEach((rel) => {
            if (rel.source_character_id === char.id) {
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
            relatedCharacters?.map((c) => [c.id, c.name]) || []
          );

          // Get shared memories
          const { data: memories } = await supabaseAdmin
            .from('character_memories')
            .select('id, journal_entry_id, created_at, summary')
            .eq('character_id', char.id)
            .order('created_at', { ascending: false })
            .limit(20);

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
            social_media: social_media || undefined,
            metadata: metadata,
            created_at: char.created_at,
            updated_at: char.updated_at,
            memory_count: memoryCount || 0,
            relationship_count: relationshipCount || 0,
            relationships: relationships?.map((rel) => {
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
            }) || [],
            shared_memories: memories?.map((mem) => ({
              id: mem.id,
              entry_id: mem.journal_entry_id,
              date: mem.created_at,
              summary: mem.summary || undefined
            })) || []
          };
        })
      );

      return res.json({ characters: charactersWithStats });
    }

    // Fallback to people_places table (legacy system)
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
    res.json({ characters });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list characters');
    res.status(500).json({ error: 'Failed to load characters' });
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

export const charactersRouter = router;
