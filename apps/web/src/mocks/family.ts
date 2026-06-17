import type { FamilyTree } from '../types/socialRoles';
import type { HouseholdDTO } from '../components/family/HouseholdDirectory';
import type { RelationshipAnalyticDTO } from '../components/family/FamilyAnalyticsPanel';
import type { Character } from '../components/characters/CharacterProfileCard';

export type FamilyGroupMock = {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
};

export type FamilySummaryMock = {
  success: true;
  tree: FamilyTree;
  households: HouseholdDTO[];
  familyGroups: FamilyGroupMock[];
  analytics: RelationshipAnalyticDTO[];
};

export const DEMO_FAMILY_TREE: FamilyTree = {
  self_id: 'self',
  branches: [
    { side: 'maternal', label: "Solenne (Mom's side)", color: '#f472b6' },
    { side: 'paternal', label: "Thornwick (Dad's side)", color: '#60a5fa' },
    { side: 'partner', label: 'Partner branch', color: '#34d399' },
  ],
  members: [
    { id: 'self', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
    { id: 'mom-elena', name: 'Elena Solenne', relation: 'parent', relation_label: 'Mom', generation: -1, side: 'maternal', closeness: 91, inference_status: 'asserted' },
    { id: 'dad-carlos', name: 'Carlos Thornwick', relation: 'parent', relation_label: 'Dad', generation: -1, side: 'paternal', closeness: 84, inference_status: 'asserted' },
    { id: 'sis-maya', name: 'Maya Thornwick', relation: 'sibling', relation_label: 'Sister', generation: 0, side: 'paternal', closeness: 89, inference_status: 'inferred' },
    { id: 'bro-noah', name: 'Noah Thornwick', relation: 'half_sibling', relation_label: 'Half-brother', generation: 0, side: 'paternal', closeness: 76, inference_status: 'inferred' },
    { id: 'gma-lucia', name: 'Lucia Solenne', relation: 'grandparent', relation_label: 'Grandma', generation: -2, side: 'maternal', closeness: 88, inference_status: 'asserted' },
    { id: 'gpa-raul', name: 'Raul Solenne', relation: 'grandparent', relation_label: 'Grandpa', generation: -2, side: 'maternal', deceased: true, closeness: 72, inference_status: 'inferred' },
    { id: 'uncle-javier', name: 'Javier Solenne', relation: 'uncle', relation_label: 'Uncle', generation: -1, side: 'maternal', closeness: 67, inference_status: 'inferred' },
    { id: 'cousin-lina', name: 'Lina Solenne', relation: 'cousin', relation_label: 'Cousin', generation: 0, side: 'maternal', closeness: 81, inference_status: 'inferred' },
    { id: 'partner-sam', name: 'Sam Park', relation: 'spouse', relation_label: 'Partner', generation: 0, side: 'partner', closeness: 97, inference_status: 'asserted' },
    { id: 'child-ivy', name: 'Ivy Park', relation: 'child', relation_label: 'Daughter', generation: 1, side: 'partner', closeness: 98, inference_status: 'inferred' },
  ],
};

export const DEMO_FAMILY_HOUSEHOLDS: HouseholdDTO[] = [
  {
    id: 'home-1',
    name: 'Thornwick Home',
    locationName: 'Harbor District Household',
    headOfHousehold: 'Carlos Thornwick',
    residents: [
      { characterId: 'self', name: 'You', householdRole: 'resident', kinshipLabel: 'self', confidence: 0.95 },
      { characterId: 'partner-sam', name: 'Sam Park', householdRole: 'resident', kinshipLabel: 'partner', confidence: 0.92 },
      { characterId: 'child-ivy', name: 'Ivy Park', householdRole: 'resident', kinshipLabel: 'daughter', confidence: 0.88 },
    ],
    visitors: [
      { characterId: 'mom-elena', name: 'Elena Solenne', householdRole: 'visitor', kinshipLabel: 'mom', confidence: 0.73 },
    ],
    residentCount: 3,
    confidence: 0.91,
  },
  {
    id: 'home-2',
    name: 'Solenne House',
    locationName: 'Cliffside Family House',
    headOfHousehold: 'Lucia Solenne',
    residents: [
      { characterId: 'gma-lucia', name: 'Lucia Solenne', householdRole: 'resident', kinshipLabel: 'grandma', confidence: 0.93 },
      { characterId: 'uncle-javier', name: 'Javier Solenne', householdRole: 'resident', kinshipLabel: 'uncle', confidence: 0.85 },
    ],
    visitors: [
      { characterId: 'cousin-lina', name: 'Lina Solenne', householdRole: 'visitor', kinshipLabel: 'cousin', confidence: 0.77 },
    ],
    residentCount: 2,
    confidence: 0.86,
  },
];

export const DEMO_FAMILY_GROUPS: FamilyGroupMock[] = [
  { id: 'grp-holidays', name: 'Holiday Planning Crew', metadata: { members: 6, strength: 'high', cadence: 'weekly' } },
  { id: 'grp-care', name: 'Grandma Care Circle', metadata: { members: 4, strength: 'high', cadence: 'daily check-ins' } },
  { id: 'grp-kids', name: 'Cousins & Kids Meetup', metadata: { members: 5, strength: 'medium', cadence: 'monthly' } },
  { id: 'grp-finance', name: 'Family Finance Sync', metadata: { members: 3, strength: 'medium', cadence: 'monthly' } },
];

export const DEMO_FAMILY_ANALYTICS: RelationshipAnalyticDTO[] = [
  { characterId: 'partner-sam', name: 'Sam Park', kinshipLabel: 'Partner', strength: 0.97, mentionCount: 29, evidenceCount: 21, trend: 'growing' },
  { characterId: 'mom-elena', name: 'Elena Solenne', kinshipLabel: 'Mom', strength: 0.92, mentionCount: 22, evidenceCount: 17, trend: 'stable' },
  { characterId: 'child-ivy', name: 'Ivy Park', kinshipLabel: 'Daughter', strength: 0.95, mentionCount: 18, evidenceCount: 15, trend: 'growing' },
  { characterId: 'sis-maya', name: 'Maya Thornwick', kinshipLabel: 'Sister', strength: 0.83, mentionCount: 16, evidenceCount: 11, trend: 'stable' },
  { characterId: 'cousin-lina', name: 'Lina Solenne', kinshipLabel: 'Cousin', strength: 0.8, mentionCount: 13, evidenceCount: 9, trend: 'growing' },
  { characterId: 'dad-carlos', name: 'Carlos Thornwick', kinshipLabel: 'Dad', strength: 0.74, mentionCount: 11, evidenceCount: 8, trend: 'inactive' },
  { characterId: 'uncle-javier', name: 'Javier Solenne', kinshipLabel: 'Uncle', strength: 0.62, mentionCount: 8, evidenceCount: 6, trend: 'inactive' },
];

export const DEMO_FAMILY_SUMMARY: FamilySummaryMock = {
  success: true,
  tree: DEMO_FAMILY_TREE,
  households: DEMO_FAMILY_HOUSEHOLDS,
  familyGroups: DEMO_FAMILY_GROUPS,
  analytics: DEMO_FAMILY_ANALYTICS,
};

export const DEMO_FAMILY_CHARACTERS_BY_ID: Record<string, Character> = {
  'mom-elena': { id: 'mom-elena', name: 'Elena Solenne', role: 'parent', status: 'active', user_id: '', summary: 'Warm, practical, and keeps everyone connected.', tags: ['family', 'caregiver'], memory_count: 14 },
  'dad-carlos': { id: 'dad-carlos', name: 'Carlos Thornwick', role: 'parent', status: 'active', user_id: '', summary: 'Reserved but dependable, especially around big decisions.', tags: ['family', 'mentor'], memory_count: 10 },
  'sis-maya': { id: 'sis-maya', name: 'Maya Thornwick', role: 'sibling', status: 'active', user_id: '', summary: 'Closest sibling and frequent collaborator.', tags: ['family', 'sibling'], memory_count: 12 },
  'bro-noah': { id: 'bro-noah', name: 'Noah Thornwick', role: 'half_sibling', status: 'active', user_id: '', summary: 'Younger half-brother, still building closeness.', tags: ['family', 'sibling'], memory_count: 7 },
  'gma-lucia': { id: 'gma-lucia', name: 'Lucia Solenne', role: 'grandparent', status: 'active', user_id: '', summary: 'Family anchor and regular host for gatherings.', tags: ['family', 'elder'], memory_count: 15 },
  'gpa-raul': { id: 'gpa-raul', name: 'Raul Solenne', role: 'grandparent', status: 'inactive', user_id: '', summary: 'Remembered through stories and traditions.', tags: ['family', 'legacy'], memory_count: 6 },
  'uncle-javier': { id: 'uncle-javier', name: 'Javier Solenne', role: 'uncle', status: 'active', user_id: '', summary: 'Hands-on helper during family logistics.', tags: ['family', 'support'], memory_count: 8 },
  'cousin-lina': { id: 'cousin-lina', name: 'Lina Solenne', role: 'cousin', status: 'active', user_id: '', summary: 'Frequent check-ins and co-organizer of meetups.', tags: ['family', 'cousin'], memory_count: 9 },
  'partner-sam': { id: 'partner-sam', name: 'Sam Park', role: 'partner', status: 'active', user_id: '', summary: 'Primary partner and strongest relationship signal.', tags: ['family', 'partner'], memory_count: 21 },
  'child-ivy': { id: 'child-ivy', name: 'Ivy Park', role: 'child', status: 'active', user_id: '', summary: 'Center of your current household routines.', tags: ['family', 'child'], memory_count: 17 },
};
