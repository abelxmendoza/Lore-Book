import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { evaluateLifeLogEligibility, isPublishableLifeLogTitle } from './lifeLogEligibilityPolicy';

const POLICY_VERSION = 'v2';
const BATCH_LIMIT = 50;
const inFlight = new Map<string, Promise<{ checked: number; quarantined: number; published: number }>>();

/**
 * Deterministic, bounded repair for derived Life Log rows. Raw messages,
 * extracted units, and provenance links are never deleted or rewritten.
 */
async function runMaintenance(userId: string): Promise<{ checked: number; quarantined: number; published: number }> {
  const { data: rows, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, type, metadata')
    .eq('user_id', userId)
    .or(`metadata->life_log->>policy_version.is.null,metadata->life_log->>policy_version.neq.${POLICY_VERSION}`)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw error;

  let quarantined = 0;
  let published = 0;
  for (const row of rows ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const decision = evaluateLifeLogEligibility({
      text: [row.summary, row.title].filter(Boolean).join(' '),
      title: row.title,
      type: row.type,
      metadata,
    });
    const publicationStatus = decision.eligible && isPublishableLifeLogTitle(row.title)
      ? 'published'
      : 'quarantined';
    const { error: updateError } = await supabaseAdmin.from('resolved_events').update({
      metadata: {
        ...metadata,
        life_log: {
          publication_status: publicationStatus,
          eligibility_reason: decision.eligible && !isPublishableLifeLogTitle(row.title)
            ? 'rejected_failed_extraction'
            : decision.reason,
          eligibility_confidence: decision.confidence,
          policy_version: POLICY_VERSION,
          evaluated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('user_id', userId);
    if (updateError) throw updateError;
    if (publicationStatus === 'published') published += 1;
    else quarantined += 1;
  }

  logger.info({ userId, checked: rows?.length ?? 0, quarantined, published }, 'Life Log deterministic maintenance completed');
  return { checked: rows?.length ?? 0, quarantined, published };
}

/** Coalesces concurrent chat/open triggers so one user has at most one repair batch. */
export function maintainLifeLogForUser(userId: string): Promise<{ checked: number; quarantined: number; published: number }> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runMaintenance(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}
