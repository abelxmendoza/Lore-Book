/**
 * Community clusters from organizations — NOT narrative anchors.
 *
 * Membership alone must never publish into Narrative Anchors.
 * These records are retained only when cognition promotes them after
 * event/theme enrichment (handled by narrativeAnchorEngine).
 */
import type {
  AnchorBuildContext,
  AnchorEvidence,
  AnchorMember,
  NarrativeAnchor,
} from './narrativeAnchorTypes';
import { scoreAnchor } from './anchorScoringService';
import { narrativeAnchorEngine } from '../narrativeAnchors/narrativeAnchorEngine';
import { communitiesFromOrganizations } from '../communities/communityDetectionEngine';

const COMMUNITY_TYPE_LABELS: Record<string, string> = {
  band: 'Band Community',
  school: 'School Community',
  team: 'Team Community',
  family: 'Family Community',
  work: 'Work Community',
  robotics: 'Robotics Community',
  music: 'Music Community',
  goth: 'Goth Community',
  ska: 'Ska Community',
};

function communityTitle(org: { name: string; type?: string }): string {
  const t = (org.type ?? '').toLowerCase();
  for (const [key, label] of Object.entries(COMMUNITY_TYPE_LABELS)) {
    if (t.includes(key) || org.name.toLowerCase().includes(key)) return label;
  }
  return `${org.name} Community`;
}

/**
 * Build community-sourced candidates and only keep those that pass
 * narrative-anchor cognition (almost never for pure membership).
 */
export function buildCommunityAnchors(ctx: AnchorBuildContext): NarrativeAnchor[] {
  const anchors: NarrativeAnchor[] = [];
  const builtAt = new Date().toISOString();

  // Explicit community graph (side channel for future UI) — not returned as anchors.
  void communitiesFromOrganizations(
    ctx.organizations.map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      memberNames: org.memberIds
        .map((id) => ctx.entities.find((e) => e.entityId === id)?.name)
        .filter(Boolean) as string[],
    })),
  );

  for (const org of ctx.organizations) {
    if (org.memberIds.length < 2) continue;

    const entities: AnchorMember[] = org.memberIds
      .map((id) => {
        const ent = ctx.entities.find((e) => e.entityId === id);
        if (!ent) return null;
        const evidence: AnchorEvidence[] = [
          {
            id: `org-${org.id}`,
            label: `Member of ${org.name}`,
            source: 'organization',
            sourceRef: org.id,
            confidence: 0.8,
          },
        ];
        return {
          id: ent.entityId,
          kind: 'entity' as const,
          name: ent.name,
          role: 'member',
          evidence,
        };
      })
      .filter(Boolean) as AnchorMember[];

    const groups: AnchorMember[] = [
      {
        id: org.id,
        kind: 'group',
        name: org.name,
        role: 'community',
        evidence: [
          {
            id: `group-${org.id}`,
            label: org.type ? `${org.type} organization` : 'organization',
            source: 'organization',
            sourceRef: org.id,
            confidence: 0.85,
          },
        ],
      },
    ];

    const evidence: AnchorEvidence[] = [
      {
        id: `community-${org.id}`,
        label: `${org.memberIds.length} members share ${org.name}`,
        source: 'organization',
        sourceRef: org.id,
        confidence: 0.75,
      },
    ];

    const draftTitle = communityTitle(org);
    const cognition = narrativeAnchorEngine.evaluate({
      title: draftTitle,
      proposedType: 'community',
      peopleNames: entities.map((e) => e.name),
      groupNames: [org.name],
      eventTitles: [],
      evidenceLabels: evidence.map((e) => e.label),
      signals: ['organization_membership', org.type ?? 'organization'],
      membershipOnly: true,
      memberCount: org.memberIds.length,
      eventCount: 0,
    });

    // Pure membership communities are not narrative anchors.
    if (cognition.status !== 'published') continue;

    const anchor: NarrativeAnchor = {
      id: `community-${org.id}`,
      title: cognition.title,
      anchorType: 'community',
      confidence: cognition.confidence,
      gravityScore: 0,
      entities,
      events: [],
      groups,
      places: [],
      evidence,
      provenance: {
        builtAt,
        signals: ['organization_membership', `cognition:${cognition.decision}`],
        consolidationKey: `community:${org.id}`,
      },
    };

    anchor.gravityScore = scoreAnchor(anchor, ctx);
    anchors.push(anchor);
  }

  return anchors;
}
