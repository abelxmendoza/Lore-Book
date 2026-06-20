/**
 * Career timeline inference — generates review-first career entries from workplace context.
 */
import type { CareerTimelineEntry, WorkplaceCommunityInference } from './workplaceTypes';
import type { ExtractedRole } from './roleInferenceService';
import type { DeploymentSiteCandidate } from './deploymentSiteInferenceService';
import type { SkillProgressionRecord } from './workplaceTypes';

export function buildCareerTimelineEntry(input: {
  employerName: string;
  role?: ExtractedRole | null;
  skillProgressions: SkillProgressionRecord[];
  deploymentSites?: DeploymentSiteCandidate[];
}): CareerTimelineEntry {
  const skillsGained = [
    ...new Set(input.skillProgressions.map((s) => s.skill)),
  ].slice(0, 8);

  return {
    organization: input.employerName,
    role: input.role?.displayTitle,
    skillsGained,
    deploymentSites: input.deploymentSites?.map((d) => d.displayName),
    confidence: input.role ? 0.88 : 0.82,
    inferredNotConfirmed: true,
  };
}

export function buildWorkplaceCommunity(input: {
  employerName: string;
  memberNames: string[];
}): WorkplaceCommunityInference {
  return {
    communityName: `${input.employerName} Community`,
    members: ['User', ...input.memberNames],
    confidence: 0.8,
    inferredNotConfirmed: true,
  };
}

export function formatCareerTimelineSummary(entry: CareerTimelineEntry): string {
  const roleLine = entry.role ? `Role: ${entry.role}` : 'Role: (review needed)';
  const skillsLine =
    entry.skillsGained.length > 0
      ? `Skills gained: ${entry.skillsGained.slice(0, 5).join(', ')}`
      : 'Skills gained: (pending review)';
  return `Worked at ${entry.organization}\n${roleLine}\n${skillsLine}`;
}

export function buildOrganizationHierarchy(input: {
  employerName: string;
  deploymentSites: DeploymentSiteCandidate[];
}): { name: string; children: Array<{ name: string; kind: string }> } {
  return {
    name: input.employerName,
    children: [
      { name: 'Deployment Sites', kind: 'category' },
      ...input.deploymentSites.map((d) => ({ name: d.displayName, kind: 'DeploymentSite' })),
    ],
  };
}
