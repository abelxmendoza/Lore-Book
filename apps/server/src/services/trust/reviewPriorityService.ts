/**
 * Phase 5 — rank what the user should review next.
 */
import { contradictionEngine } from '../contradiction/contradictionEngine';
import { contradictionAlertService } from '../contradictionAlertService';
import { supabaseAdmin } from '../supabaseClient';
import type { ReviewQueueItem, TrustDomain, UnknownGap, EntityTrustRow } from './trustTypes';

function domainPriority(domain: TrustDomain): number {
  const weights: Record<TrustDomain, number> = {
    characters: 100,
    relationships: 95,
    projects: 80,
    locations: 75,
    events: 70,
    organizations: 65,
    goals: 60,
    skills: 55,
    households: 50,
    communities: 45,
  };
  return weights[domain] ?? 50;
}

export async function buildReviewQueue(
  userId: string,
  unknowns: UnknownGap[],
  classified: EntityTrustRow[]
): Promise<{ conflicts: ReviewQueueItem[]; review_queue: ReviewQueueItem[] }> {
  const conflicts: ReviewQueueItem[] = [];
  const review_queue: ReviewQueueItem[] = [];

  const [contradictionReport, alerts, authorityResult] = await Promise.all([
    contradictionEngine.getReport(userId).catch(() => ({ contradictions: [] as Array<{ id: string; label: string; severity: string }> })),
    contradictionAlertService.getActiveAlerts(userId, 15).catch(() => []),
    supabaseAdmin
      .from('entity_authority_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('applied', false)
      .limit(20)
      .then((r) => r.data ?? [])
      .catch(() => []),
  ]);

  for (const c of contradictionReport.contradictions ?? []) {
    conflicts.push({
      id: `contradiction-${c.id}`,
      kind: 'contradiction',
      title: c.label,
      reason: `Stated vs revealed behavior diverges (${c.severity})`,
      domain: 'characters',
      priority: 90 + (c.severity === 'high' ? 10 : c.severity === 'medium' ? 5 : 0),
      action: 'review_contradiction',
      metadata: { contradiction_id: c.id },
    });
  }

  for (const alert of alerts) {
    conflicts.push({
      id: `alert-${alert.id}`,
      kind: 'contradiction_alert',
      title: alert.belief_content?.slice(0, 80) ?? 'Contradiction alert',
      reason: alert.suggested_action ?? 'active alert',
      domain: 'characters',
      priority: 85,
      action: 'review_alert',
      metadata: { alert_id: alert.id },
    });
  }

  for (const row of classified.filter((e) => e.state === 'conflicted')) {
    conflicts.push({
      id: `entity-conflict-${row.id}`,
      kind: 'duplicate_entity',
      title: row.name,
      reason: row.reason ?? 'unresolved duplicate',
      domain: row.domain,
      priority: 80 + domainPriority(row.domain) * 0.1,
      action: 'merge_or_dismiss',
      metadata: { entity_id: row.id },
    });
  }

  for (const decision of authorityResult as Array<Record<string, unknown>>) {
    review_queue.push({
      id: `authority-${decision.id}`,
      kind: String(decision.decision ?? 'authority'),
      title: String(decision.source_name ?? decision.target_name ?? decision.decision ?? 'Authority review'),
      reason: 'Entity authority decision pending',
      domain: 'characters',
      priority: 88,
      action: 'entity_authority',
      metadata: decision,
    });
  }

  for (const gap of unknowns.slice(0, 25)) {
    review_queue.push({
      id: gap.id,
      kind: gap.kind,
      title: gap.label,
      reason: gap.prompt,
      domain: gap.domain,
      priority: gap.priority,
      action: 'fill_gap',
      metadata: gap.metadata,
    });
  }

  for (const row of classified.filter((e) => e.state === 'suggested').slice(0, 15)) {
    review_queue.push({
      id: `suggested-${row.id}`,
      kind: 'suggested_entity',
      title: row.name,
      reason: row.reason ?? 'Detected suggestion awaiting confirmation',
      domain: row.domain,
      priority: 60 + domainPriority(row.domain) * 0.2,
      action: 'confirm_or_reject',
      metadata: { entity_id: row.id },
    });
  }

  conflicts.sort((a, b) => b.priority - a.priority);
  review_queue.sort((a, b) => b.priority - a.priority);

  return {
    conflicts: conflicts.slice(0, 30),
    review_queue: review_queue.slice(0, 40),
  };
}
