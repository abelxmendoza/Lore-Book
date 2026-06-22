import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { omegaMemoryService } from '../omegaMemoryService';
import { supabaseAdmin } from '../supabaseClient';
import type { NarrativeAnchorType } from '../narrative/narrativeAnchorTypes';
import type { TimelineAnchor } from './timelineStitchingTypes';

function mapAnchorType(attachedToType: TimelineAnchor['attachedToType']): NarrativeAnchorType {
  switch (attachedToType) {
    case 'school_period':
      return 'school_era';
    case 'work_period':
      return 'work_era';
    case 'relationship':
    case 'relationship_arc':
      return 'relationship_arc';
    case 'project':
      return 'project_arc';
    case 'place_visit':
      return 'travel_period';
    case 'narrative_anchor':
      return 'life_era';
    case 'memory':
      return 'life_era';
    default:
      return 'recurring_activity';
  }
}

function consolidationKey(anchor: TimelineAnchor): string {
  const label = normalizeNameKey(anchor.attachedToLabel ?? 'unknown');
  const phrase = normalizeNameKey(anchor.phrase);
  return `timeline_stitch:${anchor.attachedToType}:${label}:${phrase}`;
}

function rowToTimelineAnchor(row: {
  id: string;
  user_id: string;
  title: string;
  metadata: unknown;
  provenance: unknown;
}): TimelineAnchor | null {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const stored = meta.timeline_anchor as TimelineAnchor | undefined;
  if (!stored) return null;
  return { ...stored, id: stored.id || row.id, userId: row.user_id };
}

export async function loadTimelineAnchorsForUser(userId: string, limit = 500): Promise<TimelineAnchor[]> {
  const { data, error } = await supabaseAdmin
    .from('narrative_anchors')
    .select('id, user_id, title, metadata, provenance')
    .eq('user_id', userId)
    .not('consolidation_key', 'is', null)
    .like('consolidation_key', 'timeline_stitch:%')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.debug({ err: error, userId }, 'timelineStitching: load anchors failed');
    return [];
  }

  return (data ?? [])
    .map((row) => rowToTimelineAnchor(row as Parameters<typeof rowToTimelineAnchor>[0]))
    .filter((a): a is TimelineAnchor => Boolean(a));
}

export async function persistTimelineAnchors(userId: string, anchors: TimelineAnchor[]): Promise<number> {
  if (anchors.length === 0) return 0;

  let written = 0;
  for (const anchor of anchors) {
    const key = consolidationKey(anchor);
    const evidence = [
      {
        id: anchor.sourceMessageId,
        label: anchor.evidencePhrase,
        source: 'pattern' as const,
        sourceRef: anchor.sourceMessageId,
        confidence: anchor.confidence,
      },
    ];

    const row = {
      user_id: userId,
      title: `${anchor.attachedToLabel} — ${anchor.phrase}`,
      anchor_type: mapAnchorType(anchor.attachedToType),
      confidence: anchor.confidence,
      gravity_score: Math.min(1, anchor.confidence * 0.9),
      evidence,
      provenance: {
        builtAt: new Date().toISOString(),
        signals: ['timeline_stitching'],
        sourceMessageId: anchor.sourceMessageId,
        attachedToType: anchor.attachedToType,
        attachedToLabel: anchor.attachedToLabel,
      },
      metadata: {
        timeline_stitching: true,
        timeline_anchor: anchor,
        normalized_time: anchor.normalizedTime,
        recurrence: anchor.recurrence,
        requires_review: anchor.requiresReview,
      },
      consolidation_key: key,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from('narrative_anchors')
      .select('id')
      .eq('user_id', userId)
      .eq('consolidation_key', key)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin.from('narrative_anchors').update(row).eq('id', existing.id);
      if (error) {
        logger.debug({ err: error, userId, key }, 'timelineStitching: update anchor failed');
        continue;
      }
    } else {
      const { error } = await supabaseAdmin.from('narrative_anchors').insert(row);
      if (error) {
        logger.debug({ err: error, userId, key }, 'timelineStitching: insert anchor failed');
        continue;
      }
    }
    written += 1;
  }

  return written;
}

export async function queueTimelineContradictionReviews(
  userId: string,
  contradictions: Array<{
    existingPhrase: string;
    newPhrase: string;
    attachedToLabel: string;
    attachedToType: string;
    reason: string;
  }>,
  sourceMessageId: string,
): Promise<number> {
  if (contradictions.length === 0) return 0;

  const entities = await omegaMemoryService.getEntities(userId);
  const fallbackEntityId = entities[0]?.id;

  let queued = 0;
  for (const review of contradictions) {
    const labelKey = normalizeNameKey(review.attachedToLabel);
    const entity =
      entities.find((e) => normalizeNameKey(e.name) === labelKey) ??
      entities.find((e) => normalizeNameKey(e.name).includes(labelKey));
    const entityId = entity?.id ?? fallbackEntityId;
    if (!entityId) continue;

    const claimText = `Timeline contradiction for ${review.attachedToLabel}: "${review.existingPhrase}" vs "${review.newPhrase}" — ${review.reason}`;
    const { error } = await supabaseAdmin.from('memory_proposals').insert({
      user_id: userId,
      entity_id: entityId,
      claim_text: claimText,
      perspective_id: null,
      confidence: 0.55,
      temporal_context: { review_type: 'timeline_contradiction', attachedToType: review.attachedToType },
      source_excerpt: claimText.slice(0, 240),
      reasoning: review.reason,
      affected_claim_ids: [],
      risk_level: 'HIGH',
      status: 'PENDING',
      metadata: {
        timeline_contradiction: true,
        sourceMessageId,
        ...review,
      },
    });

    if (error) {
      logger.debug({ err: error, userId }, 'timelineStitching: contradiction review insert failed');
      continue;
    }
    queued += 1;
  }

  return queued;
}
