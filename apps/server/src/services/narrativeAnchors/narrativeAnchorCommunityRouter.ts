/**
 * Route candidates to community cluster types vs narrative anchors.
 */

import type { NarrativeClusterType } from './narrativeAnchorCognitionTypes';
import { isNicknameFamilyFalsePositive } from './narrativeAnchorNicknameResolver';

const PLACEHOLDER_TITLE =
  /^(family|work|social|goth|ska|school|other|general)\s+(period|community|chapter|phase|era)$/i;

const COMMUNITY_TITLE =
  /\b(community|household|family\s+group|crew|circle)\b/i;

export function routeNarrativeCluster(input: {
  title: string;
  proposedType?: string;
  membershipOnly?: boolean;
  memberCount?: number;
  eventCount?: number;
  peopleNames?: string[];
  groupNames?: string[];
  signals?: string[];
}): { clusterType: NarrativeClusterType; reasons: string[] } {
  const reasons: string[] = [];
  const title = input.title ?? '';
  const type = (input.proposedType ?? '').toLowerCase();
  const events = input.eventCount ?? 0;
  const members = input.memberCount ?? 0;

  // Membership-only org/family clusters → community graph, not anchors
  if (input.membershipOnly || (events === 0 && members >= 2 && /community|organization|membership/i.test(type + title))) {
    reasons.push('membership_only_cluster');
    if (/household/i.test(title) || /household/i.test(type)) {
      return { clusterType: 'HOUSEHOLD', reasons: [...reasons, 'household'] };
    }
    if (/family/i.test(title) || /family/i.test(type)) {
      // Guard: nickname false-positive family
      const people = input.peopleNames ?? [];
      if (people.some(isNicknameFamilyFalsePositive) && !people.some((p) => /t[ií]o\s+[A-Z]/i.test(p) || /t[ií]a\s+[A-Z]/i.test(p))) {
        reasons.push('family_signal_from_nickname_only');
        return { clusterType: 'SOCIAL_CIRCLE', reasons };
      }
      return { clusterType: 'FAMILY_GROUP', reasons: [...reasons, 'family_group'] };
    }
    if (/goth|ska|scene|band|club/i.test(title) || /goth|ska|band/i.test(type)) {
      return { clusterType: 'SOCIAL_CIRCLE', reasons: [...reasons, 'social_circle'] };
    }
    return { clusterType: 'COMMUNITY', reasons: [...reasons, 'community'] };
  }

  if (PLACEHOLDER_TITLE.test(title.trim()) || COMMUNITY_TITLE.test(title)) {
    reasons.push('placeholder_or_community_title');
    if (/household/i.test(title)) return { clusterType: 'HOUSEHOLD', reasons };
    if (/family/i.test(title)) return { clusterType: 'FAMILY_GROUP', reasons };
    if (/goth|ska|community/i.test(title)) return { clusterType: 'SOCIAL_CIRCLE', reasons };
    return { clusterType: 'COMMUNITY', reasons };
  }

  if (type === 'community' || type === 'family_period') {
    // family_period / community types need strong events to stay as anchors
    if (events < 2) {
      reasons.push('typed_community_without_events');
      if (type === 'family_period') return { clusterType: 'FAMILY_GROUP', reasons };
      return { clusterType: 'COMMUNITY', reasons };
    }
  }

  if (events >= 1 || (input.eventCount ?? 0) >= 1) {
    reasons.push('has_events_candidate_anchor');
    return { clusterType: 'NARRATIVE_ANCHOR', reasons };
  }

  reasons.push('default_unknown');
  return { clusterType: 'UNKNOWN', reasons };
}
