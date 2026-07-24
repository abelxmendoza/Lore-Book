/**
 * Build community clusters from org/membership evidence — never as narrative anchors.
 */

import type { CommunityCluster, CommunityClusterType } from './communityDetectionTypes';

export function buildCommunityFromMembership(input: {
  id: string;
  name: string;
  type?: string;
  memberNames: string[];
  evidenceLabel?: string;
}): CommunityCluster {
  const t = (input.type ?? input.name).toLowerCase();
  let type: CommunityClusterType = 'ORGANIZATION';
  if (/household/i.test(t)) type = 'HOUSEHOLD';
  else if (/family/i.test(t)) type = 'FAMILY_GROUP';
  else if (/goth|ska|scene|band|club/i.test(t)) type = 'SOCIAL_CIRCLE';
  else if (/work|team|job|company/i.test(t)) type = 'WORK_TEAM';
  else if (/scene/i.test(t)) type = 'SCENE';

  return {
    id: input.id,
    type,
    name: input.name,
    memberNames: input.memberNames,
    relatedEventTitles: [],
    placeNames: [],
    confidence: Math.min(0.9, 0.5 + input.memberNames.length * 0.08),
    evidenceLabels: [
      input.evidenceLabel
        ?? `${input.memberNames.length} members share ${input.name}`,
    ],
  };
}

export function communitiesFromOrganizations(
  orgs: Array<{ id: string; name: string; type?: string; memberNames: string[] }>,
): CommunityCluster[] {
  return orgs
    .filter((o) => o.memberNames.length >= 2)
    .map((o) =>
      buildCommunityFromMembership({
        id: `community-${o.id}`,
        name: o.name,
        type: o.type,
        memberNames: o.memberNames,
      }),
    );
}
