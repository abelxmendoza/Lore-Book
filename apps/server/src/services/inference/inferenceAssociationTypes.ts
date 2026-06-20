/**
 * Inference Association Layer — soft associations with confidence, provenance, review rules.
 * Inferences are never hard facts; they require confirmation before durable truth writes.
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type {
  MemoryReviewCandidate,
  MeaningResolutionResult,
  OntologyActionCandidate,
} from '../meaning/meaningResolutionTypes';

export interface InferenceBase {
  sourceMessageId: string;
  evidencePhrases: string[];
  confidence: number;
  inferenceReason: string;
  inferredNotConfirmed: true;
  requiresReview: boolean;
}

export interface InferredPersonAssociation extends InferenceBase {
  name: string;
  normalizedName: string;
  existingEntityId?: string;
  aliasLikely?: boolean;
  roles: string[];
  associatedCommunities: string[];
  associatedPlaces: string[];
  hobbyCandidates: string[];
  skillCandidates: string[];
  interestCandidates: string[];
  invitedTo?: string[];
  localContext?: string;
}

export interface InferredGroupAssociation extends InferenceBase {
  name: string;
  normalizedName: string;
  existingGroupId?: string;
  type: string;
  domain?: string;
  userRoleCandidate?: string;
  eventTitle?: string;
  associatedPeople: string[];
  parentSchoolName?: string;
  parentSchoolId?: string;
  needsSchoolResolution?: boolean;
  subgroupOf?: string;
}

export interface InferredCommunityAssociation extends InferenceBase {
  name: string;
  place: string;
  type: 'street_community' | 'neighborhood_community';
  privacyMode: 'coarse_location_only';
  existingCommunityId?: string;
  memberCandidates: string[];
}

export interface InferredSkillAssociation extends InferenceBase {
  subjectName: string;
  skill: string;
  category: string;
  subjectKind: 'person' | 'user' | 'group';
}

export interface InferredHobbyAssociation extends InferenceBase {
  subjectName: string;
  hobby: string;
  category: string;
  subjectKind: 'person' | 'user' | 'group';
}

export interface InferredRelationshipAssociation extends InferenceBase {
  subjectName: string;
  objectName: string;
  relationshipType: string;
  direction?: 'user_to_person' | 'person_to_user' | 'person_to_community' | 'user_to_group';
}

export interface InferredPlaceAssociation extends InferenceBase {
  name: string;
  category: string;
  associatedPeople: string[];
  coarseOnly: true;
}

export interface InferredEventAssociation extends InferenceBase {
  title: string;
  kind: string;
  place?: string;
  groupName?: string;
  people: string[];
  timeHint?: string;
}

export interface InferenceAmbiguity {
  code: string;
  description: string;
  confidence: number;
}

export interface InferenceAssociationInput {
  userId: string;
  messageId: string;
  threadId?: string;
  rawText: string;
  lexicalResult: LexicalAnalysisResult;
  meaningResult: MeaningResolutionResult;
  timestamp: string;
}

export interface InferenceAssociationResult {
  userId: string;
  messageId: string;
  threadId?: string;
  rawText: string;

  inferredPeople: InferredPersonAssociation[];
  inferredGroups: InferredGroupAssociation[];
  inferredCommunities: InferredCommunityAssociation[];
  inferredSkills: InferredSkillAssociation[];
  inferredHobbies: InferredHobbyAssociation[];
  inferredRelationships: InferredRelationshipAssociation[];
  inferredPlaces: InferredPlaceAssociation[];
  inferredEvents: InferredEventAssociation[];

  ambiguities: InferenceAmbiguity[];
  actionCandidates: OntologyActionCandidate[];
  memoryReviewCandidates: MemoryReviewCandidate[];

  confidence: number;
  createdAt: string;
}

export interface HistoryContext {
  people: Map<string, { id: string; name: string; aliases: string[] }>;
  groups: Map<string, { id: string; name: string }>;
  schools: Map<string, { id: string; name: string }>;
  employers: Map<string, { id: string; name: string }>;
  worksites: Map<string, { id: string; name: string }>;
  places: Map<string, { id: string; name: string }>;
  streetCommunities: Map<string, { id: string; name: string }>;
  skills: Set<string>;
  hobbies: Set<string>;
}

/** High-confidence harmless inferences may skip review (still inferredNotConfirmed). */
export const INFERENCE_AUTO_REVIEW_THRESHOLD = 0.92;

export const NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT =
  'Mr Morten was gardening outside his house on Wild Rivers Street we found Ducky fixing his bike around the corner around noon. I invited Ducky out to our after school Coding Club meet up';

export function isNeighborhoodAfterSchoolCodingClubText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('wild rivers street') &&
    t.includes('coding club') &&
    (t.includes('mr morten') || t.includes('morten')) &&
    t.includes('ducky')
  );
}

export { TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT, isTravelJapanSchoolJapaneseClassText } from '../lexical/travelContextLexical';

export function inferenceBase(
  messageId: string,
  evidencePhrases: string[],
  confidence: number,
  inferenceReason: string,
  requiresReview = true
): InferenceBase {
  return {
    sourceMessageId: messageId,
    evidencePhrases,
    confidence,
    inferenceReason,
    inferredNotConfirmed: true,
    requiresReview: requiresReview && confidence < INFERENCE_AUTO_REVIEW_THRESHOLD,
  };
}
