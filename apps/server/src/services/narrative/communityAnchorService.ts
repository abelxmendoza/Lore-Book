/**
 * Community anchors — organizations and inferred social clusters.
 */
import type {
  AnchorBuildContext,
  AnchorEvidence,
  AnchorMember,
  NarrativeAnchor,
} from './narrativeAnchorTypes';
import { scoreAnchor } from './anchorScoringService';

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

export function buildCommunityAnchors(ctx: AnchorBuildContext): NarrativeAnchor[] {
  const anchors: NarrativeAnchor[] = [];
  const builtAt = new Date().toISOString();

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

    const anchor: NarrativeAnchor = {
      id: `community-${org.id}`,
      title: communityTitle(org),
      anchorType: 'community',
      confidence: 0.7,
      gravityScore: 0,
      entities,
      events: [],
      groups,
      places: [],
      evidence,
      provenance: {
        builtAt,
        signals: ['organization_membership'],
        consolidationKey: `community:${org.id}`,
      },
    };

    anchor.gravityScore = scoreAnchor(anchor, ctx);
    anchors.push(anchor);
  }

  return anchors;
}
