import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type SalienceComponents = {
  frequency: number;
  recency: number;
  emotional: number;
  relationship: number;
  userCorrection: number;
  explicitEmphasis: number;
};

export function combineSalienceComponents(components: SalienceComponents): number {
  return Math.min(
    0.99,
    Math.max(
      0.05,
      components.frequency * 0.2 +
        components.recency * 0.2 +
        components.emotional * 0.15 +
        components.relationship * 0.15 +
        components.userCorrection * 0.15 +
        components.explicitEmphasis * 0.15,
    ),
  );
}

function safeRecency(startTime: string | null | undefined, now: number, horizonMs: number): number {
  if (!startTime) return 0.3;
  const ts = new Date(startTime).getTime();
  if (!Number.isFinite(ts)) return 0.3;
  return Math.max(0, 1 - (now - ts) / horizonMs);
}

export async function recomputeSalienceForUser(userId: string): Promise<number> {
  let written = 0;
  const now = Date.now();

  const { data: events, error: eventsError } = await supabaseAdmin
    .from('resolved_events')
    .select('id, start_time, confidence, metadata, people')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(200);

  if (eventsError) {
    logger.warn({ error: eventsError, userId }, 'salienceService: events query failed');
  }

  for (const event of events ?? []) {
    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    const significance = typeof meta.significance === 'number' ? meta.significance : event.confidence ?? 0.5;
    const recency = safeRecency(event.start_time, now, 1000 * 60 * 60 * 24 * 365 * 3);
    const peopleCount = Array.isArray(event.people) ? event.people.length : 0;

    const components: SalienceComponents = {
      frequency: Math.min(1, significance),
      recency,
      emotional: Math.min(1, Number(meta.emotional_intensity ?? 0) || significance * 0.5),
      relationship: Math.min(1, peopleCount * 0.25),
      userCorrection: 0,
      explicitEmphasis: significance >= 0.8 ? 0.9 : 0.3,
    };

    const { error } = await supabaseAdmin.from('salience_scores').upsert({
      user_id: userId,
      target_kind: 'resolved_event',
      target_id: event.id,
      score: combineSalienceComponents(components),
      components,
      computed_at: new Date().toISOString(),
    });

    if (!error) written += 1;
    else logger.warn({ error, userId, eventId: event.id }, 'salienceService: event upsert failed');
  }

  const { data: claims, error: claimsError } = await supabaseAdmin
    .from('narrative_claims')
    .select('id, confidence, significance, updated_at')
    .eq('user_id', userId)
    .neq('epistemic_state', 'DEPRECATED')
    .limit(100);

  if (claimsError) {
    logger.warn({ error: claimsError, userId }, 'salienceService: claims query failed');
  }

  for (const claim of claims ?? []) {
    const recency = safeRecency(claim.updated_at, now, 1000 * 60 * 60 * 24 * 365);
    const sig = claim.significance ?? claim.confidence;

    const components: SalienceComponents = {
      frequency: sig,
      recency,
      emotional: sig * 0.6,
      relationship: 0.3,
      userCorrection: 0,
      explicitEmphasis: sig,
    };

    const { error } = await supabaseAdmin.from('salience_scores').upsert({
      user_id: userId,
      target_kind: 'narrative_claim',
      target_id: claim.id,
      score: combineSalienceComponents(components),
      components,
      computed_at: new Date().toISOString(),
    });

    if (!error) written += 1;
    else logger.warn({ error, userId, claimId: claim.id }, 'salienceService: claim upsert failed');
  }

  logger.info({ userId, written }, 'salienceService: recompute complete');
  return written;
}

export async function getTopSalient(
  userId: string,
  limit = 20,
): Promise<Array<{ target_kind: string; target_id: string; score: number; components: SalienceComponents }>> {
  const { data, error } = await supabaseAdmin
    .from('salience_scores')
    .select('target_kind, target_id, score, components')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn({ error, userId }, 'salienceService: getTop query failed');
    return [];
  }

  return (data ?? []) as Array<{ target_kind: string; target_id: string; score: number; components: SalienceComponents }>;
}

export const salienceService = { recompute: recomputeSalienceForUser, getTop: getTopSalient };
