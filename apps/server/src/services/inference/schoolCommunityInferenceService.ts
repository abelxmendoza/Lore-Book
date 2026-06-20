/**
 * School / community grouping inference — generic & reusable.
 *
 * Given school-context groups (clubs, teams, friend subgroups) detected in a
 * message, infer the community hierarchy:
 *
 *   [School] School Community
 *     ├─ <club>            (subgroup_of school community)
 *     ├─ <team>            (subgroup_of school community)
 *     │    └─ <friend group>  (subgroup_of team; user associated_with)
 *
 * Resolution rules (do NOT invent a school name from the word "school"):
 *   - exactly one known school  → link groups to "<Name> School Community"
 *   - multiple known schools     → emit review chips, leave needsSchoolResolution
 *   - no known school            → "Unknown School Community", needsSchoolResolution=true
 *
 * Every association is soft: it carries sourceMessageId, evidencePhrases,
 * confidence, and inferredNotConfirmed=true. Nothing here writes to the DB.
 */

export type SchoolGroupType = 'school_club' | 'school_team' | 'social_friend_group';

export interface SchoolCommunityGroup {
  name: string;
  groupType: SchoolGroupType;
  evidencePhrase: string;
  /** For friend subgroups: the parent group name (e.g. "Football Team"). */
  subgroupOfGroup?: string;
}

export interface SchoolCommunityAssociation {
  kind: 'subgroup_of' | 'associated_with';
  childName: string;
  parentName: string;
  confidence: number;
  evidencePhrases: string[];
  sourceMessageId: string;
  inferredNotConfirmed: true;
}

export interface SchoolCommunityReviewChip {
  label: string;
  action: 'link_school' | 'create_school' | 'review_school_association';
  schoolId?: string;
}

export interface SchoolCommunityResult {
  schoolCommunityName: string;
  needsSchoolResolution: boolean;
  associations: SchoolCommunityAssociation[];
  reviewChips: SchoolCommunityReviewChip[];
  ambiguities: string[];
}

export const UNKNOWN_SCHOOL_COMMUNITY = 'Unknown School Community';

export function inferSchoolCommunityAssociations(input: {
  sourceMessageId: string;
  groups: SchoolCommunityGroup[];
  knownSchools: Array<{ id: string; name: string }>;
  /** True when the text says "at school" / "my school <group>". */
  hasSchoolContext: boolean;
  /** Username/handle to associate friend subgroups with. */
  userLabel?: string;
}): SchoolCommunityResult {
  const { sourceMessageId, groups, knownSchools, hasSchoolContext } = input;
  const userLabel = input.userLabel ?? 'User';

  const associations: SchoolCommunityAssociation[] = [];
  const reviewChips: SchoolCommunityReviewChip[] = [];
  const ambiguities: string[] = [];

  // ── Resolve the parent school community (rule 2/4/5/6) ──────────────────────
  let schoolCommunityName = UNKNOWN_SCHOOL_COMMUNITY;
  let needsSchoolResolution = true;

  if (knownSchools.length === 1) {
    schoolCommunityName = `${knownSchools[0].name} School Community`;
    needsSchoolResolution = false;
  } else if (knownSchools.length > 1) {
    // Ambiguous — do not auto-pick; surface review chips.
    ambiguities.push('school_parent_ambiguous');
    for (const school of knownSchools) {
      reviewChips.push({
        label: `Link to ${school.name}`,
        action: 'link_school',
        schoolId: school.id,
      });
    }
    reviewChips.push({ label: 'Create new school', action: 'create_school' });
  } else {
    // No known school — create an unresolved parent (rule 5). Never invent a name.
    ambiguities.push('school_parent_unresolved');
    reviewChips.push({ label: 'Review school association', action: 'review_school_association' });
  }

  const schoolBacked = hasSchoolContext || groups.some((g) => g.groupType !== 'social_friend_group');

  // ── Build the hierarchy associations (rules 1/3) ────────────────────────────
  for (const group of groups) {
    if (group.groupType === 'school_club' || group.groupType === 'school_team') {
      if (schoolBacked) {
        associations.push(base('subgroup_of', group.name, schoolCommunityName, 0.7, group.evidencePhrase, sourceMessageId));
      }
    } else if (group.groupType === 'social_friend_group') {
      const parent = group.subgroupOfGroup;
      if (parent) {
        // friend group → subgroup_of its team
        associations.push(base('subgroup_of', group.name, parent, 0.6, group.evidencePhrase, sourceMessageId));
        // the team itself → subgroup_of the school community
        if (schoolBacked && !groups.some((g) => g.name === parent && g.groupType === 'school_team')) {
          associations.push(base('subgroup_of', parent, schoolCommunityName, 0.65, group.evidencePhrase, sourceMessageId));
        }
      }
      // user associated_with the friend group (rule: do NOT create individual friends)
      associations.push(base('associated_with', userLabel, group.name, 0.7, group.evidencePhrase, sourceMessageId));
    }
  }

  return { schoolCommunityName, needsSchoolResolution, associations, reviewChips, ambiguities };
}

function base(
  kind: SchoolCommunityAssociation['kind'],
  childName: string,
  parentName: string,
  confidence: number,
  evidencePhrase: string,
  sourceMessageId: string,
): SchoolCommunityAssociation {
  return {
    kind,
    childName,
    parentName,
    confidence,
    evidencePhrases: [evidencePhrase],
    sourceMessageId,
    inferredNotConfirmed: true,
  };
}
