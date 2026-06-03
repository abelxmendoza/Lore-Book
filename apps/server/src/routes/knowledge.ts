import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// ─── GET /api/knowledge/claims ────────────────────────────────────────────────
//
// Returns all crystallized knowledge claims for the authenticated user.
// Includes evidence links for the Evidence View ("why does LoreBook believe this?").
//
// Query params:
//   status          — filter by lifecycle status (default: ACTIVE)
//   knowledge_type  — filter by taxonomy type
//   include_evidence — include evidence_links array (default: true)
//   min_confidence  — minimum confidence threshold (default: 0)

router.get(
  '/claims',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const querySchema = z.object({
      status:           z.enum(['PENDING','ACTIVE','DORMANT','HISTORICAL','SUPERSEDED','ALL']).optional(),
      knowledge_type:   z.string().optional(),
      include_evidence: z.coerce.boolean().optional(),
      min_confidence:   z.coerce.number().min(0).max(1).optional(),
    });

    const query = querySchema.parse(req.query);
    const status           = query.status ?? 'ACTIVE';
    const includeEvidence  = query.include_evidence !== false;
    const minConfidence    = query.min_confidence ?? 0;

    // Build claim query
    let claimQuery = supabaseAdmin
      .from('crystallized_knowledge')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('confidence', { ascending: false });

    if (status !== 'ALL') {
      claimQuery = claimQuery.eq('status', status);
    }

    if (query.knowledge_type) {
      claimQuery = claimQuery.eq('knowledge_type', query.knowledge_type);
    }

    const { data: claims, error: claimError } = await claimQuery;

    if (claimError) {
      return res.status(500).json({ success: false, error: 'Failed to load knowledge claims' });
    }

    if (!claims || claims.length === 0) {
      return res.json({ success: true, claims: [], total: 0 });
    }

    // Attach evidence links if requested
    let evidenceByKnowledgeId: Record<string, unknown[]> = {};
    if (includeEvidence) {
      const knowledgeIds = claims.map(c => c.id);
      const { data: links } = await supabaseAdmin
        .from('knowledge_evidence_links')
        .select('*')
        .eq('user_id', userId)
        .in('knowledge_id', knowledgeIds)
        .order('evidence_weight', { ascending: false });

      for (const link of links ?? []) {
        if (!evidenceByKnowledgeId[link.knowledge_id]) {
          evidenceByKnowledgeId[link.knowledge_id] = [];
        }
        (evidenceByKnowledgeId[link.knowledge_id] as unknown[]).push(link);
      }
    }

    const result = claims.map(claim => ({
      ...claim,
      evidence_links: includeEvidence ? (evidenceByKnowledgeId[claim.id] ?? []) : undefined,
    }));

    return res.json({ success: true, claims: result, total: result.length });
  })
);

// ─── GET /api/knowledge/claims/:id ───────────────────────────────────────────
//
// Returns a single claim with full evidence links and supersedence chain.
// This is the full Evidence Inspector view endpoint.

router.get(
  '/claims/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: claim, error } = await supabaseAdmin
      .from('crystallized_knowledge')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }

    // Evidence links
    const { data: evidenceLinks } = await supabaseAdmin
      .from('knowledge_evidence_links')
      .select('*')
      .eq('knowledge_id', id)
      .eq('user_id', userId)
      .order('evidence_weight', { ascending: false });

    // Supersedence chain — walk backwards to show claim evolution
    const chain: unknown[] = [];
    let currentId: string | null = claim.superseded_by_id;
    let depth = 0;
    while (currentId && depth < 10) {
      const { data: next } = await supabaseAdmin
        .from('crystallized_knowledge')
        .select('id, machine_claim, human_readable_claim, knowledge_type, status, confidence, created_at')
        .eq('id', currentId)
        .eq('user_id', userId)
        .single();
      if (!next) break;
      chain.push(next);
      currentId = (next as { superseded_by_id?: string }).superseded_by_id ?? null;
      depth++;
    }

    return res.json({
      success: true,
      claim: {
        ...claim,
        evidence_links: evidenceLinks ?? [],
        supersedence_chain: chain,
      },
    });
  })
);

// ─── GET /api/knowledge/summary ───────────────────────────────────────────────
//
// Returns a lightweight summary of the user's knowledge state.
// Used by the LoreBook UI to show the knowledge dashboard overview.

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const { data: claims } = await supabaseAdmin
      .from('crystallized_knowledge')
      .select('knowledge_type, status, confidence')
      .eq('user_id', userId);

    if (!claims) {
      return res.json({ success: true, summary: { total: 0, by_type: {}, by_status: {} } });
    }

    const byType: Record<string, { count: number; avg_confidence: number }> = {};
    const byStatus: Record<string, number> = {};

    for (const c of claims) {
      // by_type
      if (!byType[c.knowledge_type]) byType[c.knowledge_type] = { count: 0, avg_confidence: 0 };
      byType[c.knowledge_type].count++;
      byType[c.knowledge_type].avg_confidence += c.confidence;

      // by_status
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }

    // Finalize avg_confidence
    for (const type of Object.keys(byType)) {
      byType[type].avg_confidence = Number(
        (byType[type].avg_confidence / byType[type].count).toFixed(3)
      );
    }

    return res.json({
      success: true,
      summary: {
        total:     claims.length,
        by_type:   byType,
        by_status: byStatus,
      },
    });
  })
);

// ─── GET /api/knowledge/chat-context ─────────────────────────────────────────
//
// Bundles the active context panel payload in one request:
//   - top ACTIVE knowledge claims (confidence ≥ 0.65)
//   - active life arcs
//   - recent emotional context snapshot
//
// Designed for the chat Active Context Panel — one call, no waterfalls.

router.get(
  '/chat-context',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Run all queries in parallel
    const [claimsResult, arcsResult] = await Promise.all([
      // Top knowledge claims
      supabaseAdmin
        .from('crystallized_knowledge')
        .select('id, human_readable_claim, knowledge_type, confidence, status, last_reinforced_at')
        .eq('user_id', userId)
        .eq('status', 'ACTIVE')
        .gte('confidence', 0.65)
        .order('confidence', { ascending: false })
        .limit(6),

      // Active life arcs
      supabaseAdmin
        .from('life_arcs')
        .select('id, title, arc_type, track, confidence, is_active, start_date, end_date, dominant_emotion, emotional_arc')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .limit(5),
    ]);

    return res.json({
      success: true,
      knowledge_claims: claimsResult.data ?? [],
      life_arcs: arcsResult.data ?? [],
    });
  })
);

// ─── GET /api/knowledge/character-context/:name ──────────────────────────────
//
// Returns active knowledge claims where the character name appears in any
// evidence_summary. Powers the "What LoreBook Knows About This Person" tab.
//
// Also accepts ?relationship_id=uuid to fetch claims linked to a specific
// romantic relationship (more precise than name matching).

router.get(
  '/character-context/:name',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { name } = req.params;
    const relationshipId = req.query.relationship_id as string | undefined;

    // Load all ACTIVE claims with evidence for this user
    const { data: claims, error: claimsErr } = await supabaseAdmin
      .from('crystallized_knowledge')
      .select('id, human_readable_claim, machine_claim, knowledge_type, confidence, confidence_breakdown, status, last_reinforced_at, first_evidenced_at, trigger_type')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .order('confidence', { ascending: false });

    if (claimsErr || !claims?.length) {
      return res.json({ success: true, claims: [] });
    }

    const claimIds = claims.map(c => c.id);

    // Load evidence links for these claims
    const { data: links } = await supabaseAdmin
      .from('knowledge_evidence_links')
      .select('knowledge_id, evidence_type, evidence_id, evidence_weight, evidence_summary')
      .eq('user_id', userId)
      .in('knowledge_id', claimIds);

    if (!links?.length) {
      return res.json({ success: true, claims: [] });
    }

    // Filter claims where any evidence_summary mentions the character name
    // OR where evidence_id matches a specified relationship_id
    const nameLower = name.toLowerCase();
    const matchedIds = new Set<string>();
    const evidenceByClaimId: Record<string, typeof links> = {};

    for (const link of links) {
      if (!evidenceByClaimId[link.knowledge_id]) evidenceByClaimId[link.knowledge_id] = [];
      evidenceByClaimId[link.knowledge_id].push(link);

      const summaryMatch = link.evidence_summary?.toLowerCase().includes(nameLower);
      const relMatch = relationshipId && link.evidence_id === relationshipId;
      if (summaryMatch || relMatch) {
        matchedIds.add(link.knowledge_id);
      }
    }

    const result = claims
      .filter(c => matchedIds.has(c.id))
      .map(c => ({
        ...c,
        evidence_links: evidenceByClaimId[c.id] ?? [],
        evidence_count: (evidenceByClaimId[c.id] ?? []).length,
      }));

    return res.json({ success: true, claims: result });
  })
);

export default router;
