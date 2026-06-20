/**
 * Deployment site inference — "at Denny's in Hollywood".
 *
 * Hard rule: when an employer organization is already established in the same
 * message (e.g. Armstrong Robotics), the customer venue is a DEPLOYMENT SITE,
 * NOT a second employer.
 */
import type {
  HistoryContext,
  InferredGroupAssociation,
  InferredPlaceAssociation,
  InferredRelationshipAssociation,
  InferenceAmbiguity,
} from '../inferenceAssociationTypes';
import { inferenceBase } from '../inferenceAssociationTypes';
import { matchExistingEmployer, matchExistingWorksite } from '../historyAssociationService';

const DEPLOYMENT_RE = /\bat\s+([A-Z][\w']*(?:'s)?)\s+in\s+([A-Z][a-z]+)\b/g;

export interface DeploymentSiteCandidate {
  worksiteName: string;
  placeName: string;
  displayName: string;
  evidencePhrase: string;
  confidence: number;
}

export function extractDeploymentSites(text: string): DeploymentSiteCandidate[] {
  const sites: DeploymentSiteCandidate[] = [];
  DEPLOYMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEPLOYMENT_RE.exec(text)) !== null) {
    const worksiteName = m[1].trim();
    const placeName = m[2].trim();
    sites.push({
      worksiteName,
      placeName,
      displayName: `${worksiteName} ${placeName}`,
      evidencePhrase: m[0],
      confidence: 0.86,
    });
  }
  return sites;
}

export function inferDeploymentSiteAssociations(input: {
  text: string;
  messageId: string;
  history: HistoryContext;
  employerName?: string;
  userLabel?: string;
}): {
  places: InferredPlaceAssociation[];
  groups: InferredGroupAssociation[];
  relationships: InferredRelationshipAssociation[];
  ambiguities: InferenceAmbiguity[];
} {
  const { text, messageId, history, employerName } = input;
  const userLabel = input.userLabel ?? 'User';
  const places: InferredPlaceAssociation[] = [];
  const groups: InferredGroupAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const ambiguities: InferenceAmbiguity[] = [];

  const sites = extractDeploymentSites(text);
  if (sites.length === 0) {
    return { places, groups, relationships, ambiguities };
  }

  for (const site of sites) {
    // Hard rule: deployment site is NOT employer when org context exists.
    if (employerName) {
      ambiguities.push({
        code: 'deployment_site_not_employer',
        description: `${site.displayName} inferred as deployment site under ${employerName}, not employer.`,
        confidence: 0.92,
      });

      groups.push({
        ...inferenceBase(messageId, [site.evidencePhrase], site.confidence, 'deployment_site'),
        name: site.displayName,
        normalizedName: site.displayName.toLowerCase(),
        type: 'deployment_site',
        domain: 'workplace',
        userRoleCandidate: undefined,
        associatedPeople: [userLabel],
        subgroupOf: employerName,
        existingGroupId: matchExistingWorksite(history, site.displayName)?.id,
      });

      relationships.push({
        ...inferenceBase(messageId, [site.evidencePhrase], site.confidence, 'deployed_to'),
        subjectName: userLabel,
        objectName: site.displayName,
        relationshipType: 'deployed_to',
        direction: 'user_to_group',
      });

      relationships.push({
        ...inferenceBase(messageId, [site.evidencePhrase], site.confidence * 0.88, 'org_deployment_hierarchy'),
        subjectName: site.displayName,
        objectName: employerName,
        relationshipType: 'subgroup_of',
        direction: 'user_to_group',
      });
    } else {
      ambiguities.push({
        code: 'worksite_without_employer_context',
        description: `${site.displayName} detected without clear employer — needs review.`,
        confidence: 0.75,
      });
    }

    places.push({
      ...inferenceBase(messageId, [site.placeName], 0.84, 'deployment_place'),
      name: site.placeName,
      category: 'city_or_neighborhood',
      associatedPeople: [userLabel],
      coarseOnly: true,
    });
  }

  return { places, groups, relationships, ambiguities };
}
