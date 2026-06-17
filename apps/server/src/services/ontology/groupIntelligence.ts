/**
 * Group Intelligence — social ontology classifier for the Organizations Book.
 * Resolves flat extracted group strings into family, household, community,
 * company, institution, team, band, scene, etc.
 */
import { scoreKinshipInContext } from './lexicalIntelligence';

export type SocialGroupClass =
  | 'COMPANY' | 'INSTITUTION' | 'COMMUNITY' | 'SCENE' | 'FAMILY' | 'HOUSEHOLD'
  | 'TEAM' | 'BAND' | 'EVENT_GROUP' | 'FRIEND_GROUP' | 'PROJECT' | 'UNKNOWN';

export interface GroupClassification {
  input: string;
  rootType: 'GROUP';
  category: SocialGroupClass;
  subcategory?: string;
  isHousehold: boolean;
  isFamily: boolean;
  canonicalName: string;
  locatedIn?: string;
  possessive?: { ownerName: string; ownerIsKin: boolean; ownerRelation?: string };
  confidence: number;
  reason: string;
  suggestedGroupType: string;
}

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ');

const HOUSEHOLD_RE = /\b(household|family\s+home|home)\b/i;
const FAMILY_RE = /\b(my\s+family|the\s+family|our\s+family|^family$)\b/i;
const POSSESSIVE_HOUSEHOLD = /^([a-zà-ÿ][\wà-ÿ'’.\s-]+?)'s?\s+(household|home|house|apartment|casa)\b/i;
const COMPANY_KW = /\b(amazon|kforce|corp|inc|llc|ltd|company|employer|staffing|recruiter|agency)\b/i;
const INSTITUTION_KW = /\b(bootcamp|university|college|school|academy|institute|hospital|clinic|program)\b/i;
const COMMUNITY_KW = /\b(los\s+goths|gothicumbia|goth\s+scene|community|collective)\b/i;
const BAND_KW = /\b(band|duo|trio|quartet|ensemble)\b/i;
const TEAM_KW = /\b(team|squad|roster|lineup)\b/i;
const FRIEND_KW = /\b(friend\s+group|squad|crew|homies|inner\s+circle)\b/i;
const EVENT_GROUP_KW = /\b(party|reunion|gathering|meetup|wedding|funeral|graduation)\b/i;
const PROJECT_KW = /\b(project|initiative|campaign|collab)\b/i;

const KNOWN_COMPANIES = new Set(['amazon', 'kforce', 'google', 'meta', 'apple', 'microsoft']);
const KNOWN_COMMUNITIES = new Set(['los goths', 'gothicumbia']);

export function classifyGroup(rawName: string, context = '', storedType?: string | null): GroupClassification {
  const input = (rawName ?? '').trim();
  const n = norm(input);
  const base: GroupClassification = {
    input,
    rootType: 'GROUP',
    category: 'UNKNOWN',
    isHousehold: false,
    isFamily: false,
    canonicalName: input,
    confidence: 0.4,
    reason: 'unclassified',
    suggestedGroupType: 'other',
  };
  if (!input) return base;

  // Possessive household: "Tía Grace Household"
  const possessive = POSSESSIVE_HOUSEHOLD.exec(input);
  if (possessive) {
    const ownerName = possessive[1].trim();
    const kin = scoreKinshipInContext(ownerName, context);
    return {
      ...base,
      category: 'HOUSEHOLD',
      isHousehold: true,
      subcategory: 'POSSESSIVE_HOUSEHOLD',
      possessive: { ownerName, ownerIsKin: kin.isKin, ownerRelation: kin.relation },
      suggestedGroupType: 'household',
      confidence: 0.88,
      reason: `possessive household — ${kin.isKin ? kin.relation : 'owner'} + dwelling`,
    };
  }

  if (KNOWN_COMPANIES.has(n)) {
    const sub = n === 'kforce' ? 'STAFFING' : 'EMPLOYER';
    return { ...base, category: 'COMPANY', subcategory: sub, suggestedGroupType: 'company', confidence: 0.95, reason: 'known company' };
  }
  if (KNOWN_COMMUNITIES.has(n)) {
    return { ...base, category: 'COMMUNITY', subcategory: 'SCENE', suggestedGroupType: 'community', confidence: 0.95, reason: 'known community' };
  }

  // Named household: "Tía Grace Household", "Abuela Household" (no apostrophe required)
  if (/\bhousehold\b/i.test(n) && !FAMILY_RE.test(n)) {
    return {
      ...base,
      category: 'HOUSEHOLD',
      isHousehold: true,
      subcategory: 'HOUSEHOLD',
      suggestedGroupType: 'household',
      confidence: 0.87,
      reason: 'named household — nest under family',
    };
  }

  if (FAMILY_RE.test(n) && !/\bfamily\s+home\b/i.test(n)) {
    return { ...base, category: 'FAMILY', isFamily: true, subcategory: 'FAMILY', suggestedGroupType: 'family', confidence: 0.9, reason: 'family keyword' };
  }

  if (/\bfamily\s+home\b/i.test(n) || (HOUSEHOLD_RE.test(n) && /\b(home|house|apartment|residence)\b/i.test(n))) {
    return {
      ...base,
      category: 'HOUSEHOLD',
      isHousehold: true,
      subcategory: /\bhousehold\b/i.test(n) ? 'HOUSEHOLD' : 'DWELLING',
      suggestedGroupType: 'household',
      confidence: 0.85,
      reason: 'household/dwelling keyword — nest under family',
    };
  }

  if (/\b(anaheim|abuela|grace).*\b(home|house)\b/i.test(input)) {
    return {
      ...base,
      category: 'HOUSEHOLD',
      isHousehold: true,
      subcategory: 'DWELLING',
      suggestedGroupType: 'household',
      confidence: 0.82,
      reason: 'kin + dwelling name',
    };
  }

  if (INSTITUTION_KW.test(n)) {
    const sub = /\bbootcamp\b/i.test(n) ? 'BOOTCAMP' : /\buniversity|college|school\b/i.test(n) ? 'SCHOOL' : 'INSTITUTION';
    return { ...base, category: 'INSTITUTION', subcategory: sub, suggestedGroupType: 'institution', confidence: 0.82, reason: 'institution keyword' };
  }

  if (COMPANY_KW.test(n)) {
    const sub = /\b(kforce|staffing|recruiter)\b/i.test(n) ? 'STAFFING' : 'COMPANY';
    return { ...base, category: 'COMPANY', subcategory: sub, suggestedGroupType: 'company', confidence: 0.8, reason: 'company keyword' };
  }

  if (COMMUNITY_KW.test(n) || storedType === 'community' || storedType === 'scene') {
    const isScene = /\b(scene|goth)\b/i.test(n);
    return {
      ...base,
      category: isScene ? 'SCENE' : 'COMMUNITY',
      subcategory: isScene ? 'GOTH_SCENE' : 'INTEREST_GROUP',
      suggestedGroupType: isScene ? 'scene' : 'community',
      confidence: 0.78,
      reason: isScene ? 'scene keyword' : 'community keyword',
    };
  }

  if (BAND_KW.test(n) || storedType === 'band') {
    return { ...base, category: 'BAND', subcategory: 'BAND', suggestedGroupType: 'band', confidence: 0.8, reason: 'band keyword' };
  }

  if (TEAM_KW.test(n) || storedType === 'sports_team') {
    return { ...base, category: 'TEAM', subcategory: 'TEAM', suggestedGroupType: 'team', confidence: 0.78, reason: 'team keyword' };
  }

  if (FRIEND_KW.test(n) || storedType === 'friend_group') {
    return { ...base, category: 'FRIEND_GROUP', subcategory: 'FRIEND_GROUP', suggestedGroupType: 'friend_group', confidence: 0.75, reason: 'friend group keyword' };
  }

  if (EVENT_GROUP_KW.test(n)) {
    return { ...base, category: 'EVENT_GROUP', subcategory: 'EVENT', suggestedGroupType: 'event_group', confidence: 0.7, reason: 'event group — not a standing organization' };
  }

  if (PROJECT_KW.test(n)) {
    return { ...base, category: 'PROJECT', subcategory: 'PROJECT', suggestedGroupType: 'project', confidence: 0.72, reason: 'project keyword' };
  }

  // Stored type fallback
  if (storedType && storedType !== 'other') {
    const map: Record<string, SocialGroupClass> = {
      company: 'COMPANY', institution: 'INSTITUTION', community: 'COMMUNITY', scene: 'SCENE',
      family: 'FAMILY', household: 'HOUSEHOLD', band: 'BAND', sports_team: 'TEAM', team: 'TEAM',
      friend_group: 'FRIEND_GROUP', club: 'COMMUNITY', nonprofit: 'INSTITUTION',
    };
    const cat = map[storedType] ?? 'UNKNOWN';
    return { ...base, category: cat, suggestedGroupType: storedType, confidence: 0.6, reason: `stored group_type: ${storedType}` };
  }

  return base;
}

export function groupDuplicateScore(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter((w) => tb.has(w)).length;
  const jaccard = inter / new Set([...ta, ...tb]).size;
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment * 0.85);
}

export const groupIntelligence = { classifyGroup, groupDuplicateScore };
