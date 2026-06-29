import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { supabaseAdmin } from '../services/supabaseClient';
import {
  inferRolesFromText,
  inferRoleForPerson,
  inferRoleFromEntries,
  hierarchyLabel,
  hierarchyIcon,
  domainLabel,
} from '../services/relationships/relationshipRoleInferenceService';

const router = Router();

const relationshipTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9 _-]+$/, 'Use letters, numbers, spaces, hyphens, or underscores')
  .transform((value) => value.toLowerCase().replace(/[\s-]+/g, '_'));

const relationshipStatusSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9 _-]+$/, 'Use letters, numbers, spaces, hyphens, or underscores')
  .transform((value) => value.toLowerCase().replace(/[\s-]+/g, '_'));

const characterLinkCreateSchema = z.object({
  source_character_id: z.string().uuid(),
  target_character_id: z.string().uuid(),
  relationship_type: relationshipTypeSchema,
  status: relationshipStatusSchema.optional().default('active'),
  closeness_score: z.number().int().min(-10).max(10).optional(),
  summary: z.string().trim().max(1000).optional(),
});

const characterLinkPatchSchema = z.object({
  relationship_type: relationshipTypeSchema.optional(),
  status: relationshipStatusSchema.optional(),
  closeness_score: z.number().int().min(-10).max(10).nullable().optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'Provide at least one field to update');

const romanticTypes = new Set([
  'boyfriend',
  'girlfriend',
  'wife',
  'husband',
  'fiance',
  'fiancé',
  'fiancee',
  'fiancée',
  'lover',
  'fuck_buddy',
  'crush',
  'obsession',
  'infatuation',
  'lust',
  'ex_boyfriend',
  'ex_girlfriend',
  'ex_wife',
  'ex_husband',
  'situationship',
  'dating',
  'talking',
  'hooking_up',
  'one_night_stand',
  'complicated',
  'on_break',
  'friends_with_benefits',
  'ex_lover',
  'in_love',
  'romantic',
  'romantic_interest',
  'partner',
  'spouse',
  'ex',
]);

const romanticStatusMap: Record<string, string> = {
  active: 'active',
  confirmed: 'active',
  current: 'active',
  complicated: 'complicated',
  on_break: 'on_break',
  paused: 'paused',
  ended: 'ended',
  inactive: 'ended',
  former: 'ended',
};

const romanticTypeMap: Record<string, string> = {
  romantic: 'dating',
  romantic_interest: 'crush',
  partner: 'dating',
  spouse: 'lover',
  ex: 'ex_lover',
  fiance: 'fiancé',
  fiancee: 'fiancée',
};

function isRomanticType(type: string) {
  return romanticTypes.has(type);
}

function toRomanticRelationshipType(type: string) {
  return romanticTypeMap[type] ?? type;
}

function toRomanticStatus(status?: string | null) {
  return romanticStatusMap[status ?? 'active'] ?? 'active';
}

function relationshipResponse(
  relationship: any,
  perspectiveCharacterId: string,
  characterNameById: Map<string, string>,
) {
  const relatedCharacterId =
    relationship.source_character_id === perspectiveCharacterId
      ? relationship.target_character_id
      : relationship.source_character_id;
  return {
    id: relationship.id,
    character_id: relatedCharacterId,
    character_name: characterNameById.get(relatedCharacterId) ?? 'Unknown',
    relationship_type: relationship.relationship_type,
    closeness_score: relationship.closeness_score,
    summary: relationship.summary,
    status: relationship.status,
  };
}

async function loadOwnedCharacters(userId: string, characterIds: string[]) {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', Array.from(new Set(characterIds)));

  if (error) throw error;
  return new Map((data ?? []).map((character) => [character.id, character.name]));
}

async function syncRomanticRelationshipForCharacterLink(params: {
  userId: string;
  relationship: any;
  previousRelationshipType?: string | null;
  sourceName: string;
  targetName: string;
}) {
  const { userId, relationship } = params;
  const metadataPatch = {
    source: 'character_world_editor',
    character_relationship_id: relationship.id,
    source_character_id: relationship.source_character_id,
    source_character_name: params.sourceName,
    target_character_id: relationship.target_character_id,
    target_character_name: params.targetName,
    synced_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from('romantic_relationships')
    .select('*')
    .eq('user_id', userId)
    .eq('person_id', relationship.target_character_id)
    .eq('person_type', 'character')
    .order('updated_at', { ascending: false })
    .limit(1)
      .maybeSingle();

  if (!isRomanticType(relationship.relationship_type)) {
    const wasSyncedFromThisLink =
      existing?.metadata?.character_relationship_id === relationship.id ||
      (
        existing?.metadata?.source === 'character_world_editor' &&
        existing?.metadata?.source_character_id === relationship.source_character_id &&
        existing?.metadata?.target_character_id === relationship.target_character_id
      );
    const wasRomanticLink = Boolean(params.previousRelationshipType && isRomanticType(params.previousRelationshipType));
    if (existing && (wasSyncedFromThisLink || wasRomanticLink)) {
      await supabaseAdmin
        .from('romantic_relationships')
        .update({
          status: 'ended',
          is_current: false,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existing.metadata ?? {}),
            ...metadataPatch,
            removed_from_romantic_by_non_romantic_type: relationship.relationship_type,
          },
        })
        .eq('id', existing.id)
        .eq('user_id', userId);
    }
    return;
  }

  const nextStatus = toRomanticStatus(relationship.status);
  const payload = {
    relationship_type: toRomanticRelationshipType(relationship.relationship_type),
    status: nextStatus,
    is_current: !['ended', 'ghosted', 'blocked'].includes(nextStatus),
    is_situationship: relationship.relationship_type === 'situationship',
    updated_at: new Date().toISOString(),
    metadata: {
      ...(existing?.metadata ?? {}),
      ...metadataPatch,
      relationship_type_source: 'user_confirmed',
      relationship_type_confirmed_at: new Date().toISOString(),
    },
  };

  if (existing) {
    await supabaseAdmin
      .from('romantic_relationships')
      .update(payload)
      .eq('id', existing.id)
      .eq('user_id', userId);
    return;
  }

  await supabaseAdmin.from('romantic_relationships').insert({
    user_id: userId,
    person_id: relationship.target_character_id,
    person_type: 'character',
    start_date: new Date().toISOString(),
    ...payload,
  });
}

// ─── POST /api/relationships/character-links ────────────────────────────────
//
// Create or update a direct character-to-character link. The target must be an
// existing character in the user's Character Book; there is no free-form person
// creation on this route.

router.post(
  '/character-links',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const input = characterLinkCreateSchema.parse(req.body);
    if (input.source_character_id === input.target_character_id) {
      return res.status(400).json({ error: 'A character cannot be linked to themselves' });
    }

    const characterNameById = await loadOwnedCharacters(userId, [
      input.source_character_id,
      input.target_character_id,
    ]);
    if (characterNameById.size !== 2) {
      return res.status(404).json({ error: 'Both people must already exist in your character book' });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('character_relationships')
      .select('*')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${input.source_character_id},target_character_id.eq.${input.target_character_id}),and(source_character_id.eq.${input.target_character_id},target_character_id.eq.${input.source_character_id})`
      )
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload = {
      relationship_type: input.relationship_type,
      status: input.status,
      closeness_score: input.closeness_score ?? null,
      summary: input.summary ?? null,
      inference_status: 'asserted',
      metadata: {
        ...(existing?.metadata ?? {}),
        source: 'character_world_editor',
        manual: true,
        user_confirmed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const { data: relationship, error } = existing
      ? await supabaseAdmin
          .from('character_relationships')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single()
      : await supabaseAdmin
          .from('character_relationships')
          .insert({
            user_id: userId,
            source_character_id: input.source_character_id,
            target_character_id: input.target_character_id,
            ...payload,
          })
          .select('*')
          .single();

    if (error) throw error;

    await syncRomanticRelationshipForCharacterLink({
      userId,
      relationship,
      previousRelationshipType: existing?.relationship_type,
      sourceName: characterNameById.get(relationship.source_character_id) ?? 'Unknown',
      targetName: characterNameById.get(relationship.target_character_id) ?? 'Unknown',
    });

    return res.json({
      success: true,
      relationship: relationshipResponse(relationship, input.source_character_id, characterNameById),
    });
  })
);

// ─── PATCH /api/relationships/character-links/:id ───────────────────────────
//
// Update the type/status/details for an existing character graph link.

router.patch(
  '/character-links/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const patch = characterLinkPatchSchema.parse(req.body);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('character_relationships')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ error: 'Relationship not found' });

    const characterNameById = await loadOwnedCharacters(userId, [
      existing.source_character_id,
      existing.target_character_id,
    ]);
    if (characterNameById.size !== 2) {
      return res.status(404).json({ error: 'Relationship characters no longer exist' });
    }

    const { data: relationship, error } = await supabaseAdmin
      .from('character_relationships')
      .update({
        ...patch,
        metadata: {
          ...(existing.metadata ?? {}),
          source: 'character_world_editor',
          manual: true,
          user_confirmed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;

    await syncRomanticRelationshipForCharacterLink({
      userId,
      relationship,
      previousRelationshipType: existing.relationship_type,
      sourceName: characterNameById.get(relationship.source_character_id) ?? 'Unknown',
      targetName: characterNameById.get(relationship.target_character_id) ?? 'Unknown',
    });

    return res.json({
      success: true,
      relationship: relationshipResponse(relationship, existing.source_character_id, characterNameById),
    });
  })
);

// ─── DELETE /api/relationships/character-links/:id ──────────────────────────

router.delete(
  '/character-links/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('character_relationships')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return res.status(404).json({ error: 'Relationship not found' });

    const characterNameById = await loadOwnedCharacters(userId, [
      existing.source_character_id,
      existing.target_character_id,
    ]);

    await syncRomanticRelationshipForCharacterLink({
      userId,
      relationship: { ...existing, relationship_type: 'deleted', status: 'ended' },
      previousRelationshipType: existing.relationship_type,
      sourceName: characterNameById.get(existing.source_character_id) ?? 'Unknown',
      targetName: characterNameById.get(existing.target_character_id) ?? 'Unknown',
    });

    const { error } = await supabaseAdmin
      .from('character_relationships')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true });
  })
);

// ─── POST /api/relationships/infer-role ───────────────────────────────────────
//
// Infer relationship role from natural language text.
// Used by: character profile auto-enrichment, chat context extraction.
//
// Body: { text: string, person_name?: string }
// Returns: { roles: RelationshipRole[] }

router.post(
  '/infer-role',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      text:        z.string().min(1).max(5000),
      person_name: z.string().optional(),
    });
    const { text, person_name } = schema.parse(req.body);

    const roles = person_name
      ? (() => { const r = inferRoleForPerson(person_name, text); return r ? [r] : []; })()
      : inferRolesFromText(text);

    // Enrich with human-readable labels
    const enriched = roles.map(r => ({
      ...r,
      hierarchy_label: hierarchyLabel(r.hierarchy),
      hierarchy_icon:  hierarchyIcon(r.hierarchy),
      domain_label:    domainLabel(r.domain),
    }));

    return res.json({ success: true, roles: enriched });
  })
);

// ─── POST /api/relationships/infer-role-from-entries ─────────────────────────
//
// Infer role for a character by scanning their journal entries.
// More accurate than single-text inference — uses frequency weighting.
//
// Body: { person_name: string, character_id?: string }
// Returns: { role: RelationshipRole | null }

router.post(
  '/infer-role-from-entries',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const schema = z.object({
      person_name:   z.string().min(1),
      character_id:  z.string().uuid().optional(),
      max_entries:   z.number().int().min(1).max(100).optional(),
    });
    const { person_name, max_entries = 50 } = schema.parse(req.body);

    // Fetch recent journal entries
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('content, date')
      .eq('user_id', userId)
      .ilike('content', `%${person_name.split(' ')[0]}%`)
      .order('date', { ascending: false })
      .limit(max_entries);

    if (!entries?.length) {
      return res.json({ success: true, role: null, reason: 'No entries found mentioning this person' });
    }

    const role = inferRoleFromEntries(person_name, entries);

    return res.json({
      success: true,
      role: role ? {
        ...role,
        hierarchy_label: hierarchyLabel(role.hierarchy),
        hierarchy_icon:  hierarchyIcon(role.hierarchy),
        domain_label:    domainLabel(role.domain),
      } : null,
      entries_scanned: entries.length,
    });
  })
);

// ─── GET /api/relationships/role-taxonomy ────────────────────────────────────
//
// Returns the full role taxonomy for use in the frontend.
// Frontend uses this to display domain/role labels without hardcoding.

router.get(
  '/role-taxonomy',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const { ROLE_PATTERNS } = await import('../services/relationships/socialRoleTaxonomy');

    const taxonomy: Record<string, Array<{ role: string; hierarchy: string }>> = {};
    for (const p of ROLE_PATTERNS) {
      if (!taxonomy[p.domain]) taxonomy[p.domain] = [];
      const existing = taxonomy[p.domain].find(e => e.role === p.role);
      if (!existing) taxonomy[p.domain].push({ role: p.role, hierarchy: p.hierarchy });
    }

    return res.json({ success: true, taxonomy });
  })
);

export default router;
