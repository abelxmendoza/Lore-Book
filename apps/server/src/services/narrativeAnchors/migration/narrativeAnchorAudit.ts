/**
 * Dry-run audit of persisted narrative anchors through cognition.
 */

import { narrativeAnchorEngine } from '../narrativeAnchorEngine';
import {
  NARRATIVE_ANCHOR_MIGRATION_VERSION,
  type NarrativeAnchorMigrationPlanItem,
  type NarrativeAnchorMigrationSummary,
} from './narrativeAnchorMigrationTypes';

export type AnchorRowLite = {
  id: string;
  title: string;
  anchor_type?: string;
  evidence?: unknown;
  provenance?: unknown;
  metadata?: Record<string, unknown> | null;
};

function extractLabels(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .map((e) => (typeof e === 'object' && e && 'label' in e ? String((e as any).label) : String(e)))
    .filter(Boolean);
}

function extractSignals(provenance: unknown): string[] {
  if (!provenance || typeof provenance !== 'object') return [];
  const signals = (provenance as { signals?: unknown }).signals;
  return Array.isArray(signals) ? signals.map(String) : [];
}

export function auditNarrativeAnchors(
  userId: string,
  rows: AnchorRowLite[],
  opts: { dryRun?: boolean } = {},
): NarrativeAnchorMigrationSummary {
  const dryRun = opts.dryRun !== false;
  const items: NarrativeAnchorMigrationPlanItem[] = [];

  for (const row of rows) {
    const evidenceLabels = extractLabels(row.evidence);
    const signals = extractSignals(row.provenance);
    const membershipOnly = evidenceLabels.some((l) => /members?\s+share/i.test(l));
    const cognition = narrativeAnchorEngine.evaluate({
      title: row.title,
      proposedType: row.anchor_type,
      evidenceLabels,
      signals,
      membershipOnly,
      eventCount: membershipOnly ? 0 : Math.max(1, evidenceLabels.filter((l) => !/members?\s+share/i.test(l)).length),
      memberCount: 3,
    });

    if (cognition.decision === 'PUBLISH_ANCHOR') {
      if (cognition.title !== row.title) {
        items.push({
          anchorId: row.id,
          originalTitle: row.title,
          decision: 'RENAME',
          newTitle: cognition.title,
          reason: 'title_synthesis',
          confidence: cognition.confidence,
          reversible: true,
        });
      } else {
        items.push({
          anchorId: row.id,
          originalTitle: row.title,
          decision: 'KEEP',
          reason: 'eligible_anchor',
          confidence: cognition.confidence,
          reversible: true,
        });
      }
      continue;
    }

    const routeMap: Record<string, NarrativeAnchorMigrationPlanItem['decision']> = {
      ROUTE_COMMUNITY: 'ROUTE_COMMUNITY',
      ROUTE_HOUSEHOLD: 'ROUTE_HOUSEHOLD',
      ROUTE_FAMILY_GROUP: 'ROUTE_FAMILY_GROUP',
      ROUTE_SOCIAL_CIRCLE: 'ROUTE_SOCIAL_CIRCLE',
      ROUTE_ORGANIZATION: 'ROUTE_COMMUNITY',
    };

    if (routeMap[cognition.decision]) {
      items.push({
        anchorId: row.id,
        originalTitle: row.title,
        decision: routeMap[cognition.decision]!,
        reason: cognition.rejectionReason ?? cognition.decision,
        confidence: cognition.confidence,
        reversible: true,
      });
      continue;
    }

    if (cognition.decision === 'NEEDS_REVIEW' || cognition.decision === 'SPLIT') {
      items.push({
        anchorId: row.id,
        originalTitle: row.title,
        decision: 'NEEDS_REVIEW',
        newTitle: cognition.title !== row.title ? cognition.title : undefined,
        reason: cognition.rejectionReason ?? 'needs_review',
        confidence: cognition.confidence,
        reversible: true,
      });
      continue;
    }

    // Weak relationship-arc labels and low-coherence drafts: review, not hard archive,
    // unless they are clearly placeholder community titles.
    if (isPlaceholderCommunityTitle(row.title) || membershipOnly) {
      items.push({
        anchorId: row.id,
        originalTitle: row.title,
        decision: 'ARCHIVE',
        reason: cognition.rejectionReason ?? 'rejected_placeholder_or_membership',
        confidence: cognition.confidence,
        reversible: true,
      });
      continue;
    }

    items.push({
      anchorId: row.id,
      originalTitle: row.title,
      decision: 'NEEDS_REVIEW',
      newTitle: cognition.title !== row.title ? cognition.title : undefined,
      reason: cognition.rejectionReason ?? 'weak_candidate_review',
      confidence: cognition.confidence,
      reversible: true,
    });
  }

  return {
    version: NARRATIVE_ANCHOR_MIGRATION_VERSION,
    userId,
    totalRecords: rows.length,
    keepCount: items.filter((i) => i.decision === 'KEEP').length,
    renameCount: items.filter((i) => i.decision === 'RENAME').length,
    routeCount: items.filter((i) => i.decision.startsWith('ROUTE_')).length,
    archiveCount: items.filter((i) => i.decision === 'ARCHIVE').length,
    reviewCount: items.filter((i) => i.decision === 'NEEDS_REVIEW').length,
    items,
    dryRun,
    generatedAt: new Date().toISOString(),
  };
}

function isPlaceholderCommunityTitle(title: string): boolean {
  return /^(family|work|social|goth|ska|school|other|general|life)\s+(period|community|chapter|phase|era|group)$/i.test(
    (title ?? '').trim(),
  ) || /\b(community|household)\s*$/i.test((title ?? '').trim());
}

export function formatNarrativeAnchorAuditMarkdown(summary: NarrativeAnchorMigrationSummary): string {
  const lines = [
    `# Narrative Anchors Audit (${summary.version})`,
    '',
    `- User: ${summary.userId}`,
    `- Dry-run: ${summary.dryRun}`,
    `- Total: ${summary.totalRecords}`,
    `- Keep: ${summary.keepCount}`,
    `- Rename: ${summary.renameCount}`,
    `- Route to community: ${summary.routeCount}`,
    `- Archive: ${summary.archiveCount}`,
    `- Review: ${summary.reviewCount}`,
    '',
    '## Items',
    '',
  ];
  for (const item of summary.items.slice(0, 80)) {
    lines.push(
      `- **${item.originalTitle}** → \`${item.decision}\`${item.newTitle ? ` (${item.newTitle})` : ''}: ${item.reason}`,
    );
  }
  return lines.join('\n');
}
