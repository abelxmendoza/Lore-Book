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
