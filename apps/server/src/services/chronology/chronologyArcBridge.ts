/**
 * Chronology → Arc Bridge
 *
 * Connects ChronologyEngine V1 outputs to the autobiographical arc graph.
 * Previously, causal chains and Allen-algebra edges were written to
 * `graph_edges` — a table nobody queries. This service redirects that
 * intelligence into `arc_relationships`, making chronology findings
 * part of the live arc graph that the system prompt, biography engine,
 * and knowledge crystallization system all consume.
 *
 * Mapping:
 *   V1 'causes'   edge   → arc_relationship 'spawned'
 *   V1 'before'   edge   → arc_relationship 'preceded'
 *   V1 'overlaps' edge   → arc_relationship 'overlapped'
 *   V1 'contains' edge   → arc_relationship 'overlapped'
 *   V1 'during'   edge   → arc_relationship 'overlapped'
 *   causal chain (≥2)    → arc_relationship 'spawned' (root → terminus arc)
 *
 * Name resolution:
 *   event timestamp → find the life_arc whose [start_date, end_date] contains it.
 *   One query per event batch; all arc lookups are done in a single IN query.
 *   Only operates on arcs with confidence ≥ 0.5 (visible arcs).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { arcRelationshipService } from '../continuityRuntime/arcs/arcRelationshipService';
import type { TemporalEdge, CausalChain, ChronologyResult } from './types';

type ArcRelationType = 'spawned' | 'influenced' | 'overlapped' | 'preceded' | 'merged' | 'split';

const ALLEN_TO_ARC: Record<string, ArcRelationType | null> = {
  causes:   'spawned',
  before:   'preceded',
  after:    null,          // handled by the inverse edge (before)
  overlaps: 'overlapped',
  meets:    'preceded',
  contains: 'overlapped',
  during:   'overlapped',
  starts:   'overlapped',
  finishes: 'overlapped',
  equals:   null,          // same arc — skip
};

// ─── Arc lookup by event timestamp ───────────────────────────────────────────

async function findArcForTimestamp(
  userId: string,
  timestamp: string | null
): Promise<string | null> {
  if (!timestamp) return null;

  const { data } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .lte('start_date', timestamp.substring(0, 10))   // DATE comparison
    .gte('confidence', 0.5)
    .or(`end_date.gte.${timestamp.substring(0, 10)},end_date.is.null`)
    .order('confidence', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a full ChronologyResult and write meaningful findings into arc_relationships.
 * Called after V1 processes events. Fire-and-forget safe — never throws.
 */
export async function bridgeChronologyToArcs(
  userId: string,
  result: ChronologyResult,
  // Map from event ID → timestamp (populated from the events array)
  eventTimestamps: Map<string, string | null>
): Promise<void> {
  try {
    await Promise.all([
      bridgeEdges(userId, result.graph.edges, eventTimestamps),
      bridgeCausalChains(userId, result.causalChains, eventTimestamps),
    ]);
  } catch (err) {
    // Non-fatal — chronology processing must never fail because of this bridge
    logger.error({ err, userId }, 'chronologyArcBridge: failed (non-blocking)');
  }
}

// ─── Edge bridge ─────────────────────────────────────────────────────────────

async function bridgeEdges(
  userId: string,
  edges: TemporalEdge[],
  timestamps: Map<string, string | null>
): Promise<void> {
  // Only process high-confidence edges with meaningful arc mappings
  const relevant = edges.filter(e => {
    const arcType = ALLEN_TO_ARC[e.relation];
    return arcType !== null && arcType !== undefined && e.confidence >= 0.65;
  });

  if (relevant.length === 0) return;

  // Deduplicate: one arc-relationship per (sourceArcId, targetArcId, type) pair
  const written = new Set<string>();

  for (const edge of relevant) {
    const arcType = ALLEN_TO_ARC[edge.relation]!;
    const sourceTs = timestamps.get(edge.source);
    const targetTs = timestamps.get(edge.target);

    const [sourceArcId, targetArcId] = await Promise.all([
      findArcForTimestamp(userId, sourceTs ?? null),
      findArcForTimestamp(userId, targetTs ?? null),
    ]);

    if (!sourceArcId || !targetArcId || sourceArcId === targetArcId) continue;

    const key = `${sourceArcId}:${targetArcId}:${arcType}`;
    if (written.has(key)) continue;
    written.add(key);

    await arcRelationshipService.upsert(userId, {
      source_arc_id:     sourceArcId,
      target_arc_id:     targetArcId,
      relationship_type: arcType,
      description:       `Inferred from chronology: ${edge.relation} (confidence ${edge.confidence.toFixed(2)})`,
      confidence:        edge.confidence * 0.85, // Slight penalty — inferred, not confirmed
      metadata:          { source: 'chronology_v1', allen_relation: edge.relation },
    }).catch(err =>
      logger.debug({ err, sourceArcId, targetArcId }, 'chronologyArcBridge: edge upsert failed')
    );
  }

  logger.debug(
    { userId, edgesProcessed: relevant.length, written: written.size },
    'chronologyArcBridge: edges bridged'
  );
}

// ─── Causal chain bridge ─────────────────────────────────────────────────────
//
// A causal chain (root → ... → terminus) implies the root arc "spawned"
// the terminus arc. Only chains of length ≥ 3 are meaningful enough to
// write as arc relationships.

async function bridgeCausalChains(
  userId: string,
  chains: CausalChain[],
  timestamps: Map<string, string | null>
): Promise<void> {
  const meaningful = chains.filter(c => c.chain.length >= 3 && c.confidence >= 0.6);
  if (meaningful.length === 0) return;

  const written = new Set<string>();

  for (const chain of meaningful) {
    const rootTs     = timestamps.get(chain.rootEvent);
    const terminusId = chain.chain[chain.chain.length - 1];
    const termTs     = timestamps.get(terminusId);

    const [rootArcId, termArcId] = await Promise.all([
      findArcForTimestamp(userId, rootTs ?? null),
      findArcForTimestamp(userId, termTs ?? null),
    ]);

    if (!rootArcId || !termArcId || rootArcId === termArcId) continue;

    const key = `${rootArcId}:${termArcId}:spawned`;
    if (written.has(key)) continue;
    written.add(key);

    await arcRelationshipService.upsert(userId, {
      source_arc_id:     rootArcId,
      target_arc_id:     termArcId,
      relationship_type: 'spawned',
      description:       `Causal chain inferred: ${chain.chain.length} events, confidence ${chain.confidence.toFixed(2)}`,
      confidence:        chain.confidence * 0.80,
      metadata:          { source: 'chronology_v1_causal_chain', chain_length: chain.chain.length },
    }).catch(err =>
      logger.debug({ err, rootArcId, termArcId }, 'chronologyArcBridge: chain upsert failed')
    );
  }

  logger.debug(
    { userId, chainsProcessed: meaningful.length, written: written.size },
    'chronologyArcBridge: causal chains bridged'
  );
}
