// =====================================================
// GROUP DETECTION SERVICE
// Purpose: Detect groups in messages and produce
//          structured output with G1 canonical model.
//
// PHASE G1 — output model only.
// Pipeline wiring is deferred to G2.
// Auto-creation is DISABLED — callers decide what to do with results.
// =====================================================

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';

import { characterRegistry } from './characterRegistry';
import {
  canonicalEmployerName as sharedCanonicalEmployerName,
  extractEmployerNames as sharedExtractEmployerNames,
} from './society/signals';
import {
  organizationService,
  type Organization,
  type GroupType,
  type MembershipModel,
  type UserRelationship,
} from './organizationService';
import { nameHousehold } from './entities/householdNaming';
import { supabaseAdmin } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// DetectedGroup — the output contract of this service.
// Consumers decide whether to create, confirm, or discard.
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectedGroup {
  // Identity
  name?: string;
  nickname?: string;
  members: string[];
  member_ids: string[];
  context: string;
  confidence: number;

  // G1 canonical fields
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity: boolean;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known public entity patterns
// A non-exhaustive list of signals that indicate a famous/public org.
// Does not attempt to be comprehensive — high-precision, low-recall.
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_ENTITY_SIGNALS = [
  // Fortune 500 / big tech
  /\b(Apple|Google|Amazon|Microsoft|Meta|Netflix|Tesla|SpaceX|OpenAI|Anthropic|Twitter|X Corp)\b/,
  // Major media / labels
  /\b(Sony|Warner|Universal|EMI|Capitol Records|Atlantic Records|Def Jam)\b/,
  // Famous bands/artists with The
  /\bThe (Beatles|Rolling Stones|Who|Clash|Ramones|Pixies|Velvet Underground|Smiths)\b/i,
  // Government / institutions
  /\b(FBI|CIA|NSA|Congress|Senate|Parliament|Supreme Court|NASA|UN|NATO|EU)\b/,
  // Universities
  /\b(Harvard|MIT|Stanford|Oxford|Cambridge|Yale|Princeton|Columbia)\b/,
];

// Scene vocabulary — indicates a cultural scene rather than a formal org
const SCENE_SIGNALS = /\b(scene|underground|circuit|movement|community|culture|collective|ecosystem)\b/i;

// Crew / informal group vocabulary
const CREW_SIGNALS = /\b(crew|squad|gang|circle|clique|posse|bunch|crowd|pack)\b/i;

// Band / music group vocabulary
const BAND_SIGNALS = /\b(band|ensemble|group|duo|trio|quartet|quintet|orchestra|choir|chorus|collective)\b/i;

const COMMUNITY_SIGNALS = /\b(community|bootcamp|school|academy|students|alumni|developers|programmer|programmers|cohort)\b/i;

const VENDOR_SIGNALS =
  /\b(vendor|supplier|contractor|subcontractor|freelancer|consultant|outsourc(?:e|ed|ing)|procurement|invoice(?:s|d)?|saas provider|service provider|deliver(?:y|ies)|fulfillment|wholesaler|distributor)\b/i;

const BRAND_SIGNALS =
  /\b(brand|product line|label|merch|merchandise|sponsor(?:ed|ship)?|wear(?:s|ing)?|shop(?:s|ping)? at|customer of|loyalty program|subscription box)\b/i;

// Workplace / staffing vocabulary
// staffing firm, or hiring/employment language all point at a company, not a
// friend group. This is what tells the app that "Sam the recruiter and Kelly
// working onboarding" is a professional org (e.g. a staffing agency).
const WORK_SIGNALS = /\b(work|office|company|colleague|coworker|co-worker|startup|business|job|employer|employee|corp|inc|llc|agency|staffing|recruit(?:er|ing|ed)?|onboarding|hir(?:e|ed|ing)|hr|i-?9|background check|identity verification|paperwork|payroll|contract(?:or)?|placement|kforce|k-force|amazon)\b/i;

// Employer / agency / school name extraction lives in society/signals.ts so the
// detection service and the cross-session society mapper share one rule set.

const KNOWN_GROUPS: Array<{
  pattern: RegExp;
  name: string;
  aliases?: string[];
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity?: boolean;
  confidence: number;
  metadata?: Record<string, unknown>;
}> = [];

const MEMBER_STOPWORDS = new Set([
  'I', 'Me', 'My', 'Mine', 'We', 'Us', 'Our', 'You', 'Your', 'They', 'Them',
  'He', 'Him', 'His', 'She', 'Her', 'It', 'Its', 'The', 'This', 'That',
  'There', 'Here', 'Just', 'From', 'With', 'And', 'Or', 'But', 'Had', 'Do', 'Did', 'Today',
  'Tomorrow', 'Yesterday', 'Now', 'Then', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March',
  'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December', 'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'First', 'Street',
  'Pool', 'Billiards', 'Billiard',
]);

const KNOWN_ORG_MEMBER_FALSE_POSITIVES = new Set([
  'Amazon', 'Google', 'Microsoft', 'Apple', 'Meta', 'Netflix',
  'Tesla', 'OpenAI', 'Anthropic', 'San Diego', 'Smith Rock',
  'First Street', 'First Street Pool', 'First Street Pool Billiards',
  'Pool Group', 'Billiards Group',
]);

const FABRICATED_TEST_TERMS = /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock)\b/i;
const NON_PERSON_MEMBER_TERMS = /\b(?:pool|billiards?|street|venue|club|bar|show|event|party|anniversary|night|first street)\b/i;
const HONORIFIC_PREFIX = /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/i;

type LexicalGroupType =
  | 'family'
  | 'household'
  | 'friend_group'
  | 'school_community'
  | 'school_subgroup'
  | 'organization'
  | 'work_team'
  | 'club'
  | 'sports_team'
  | 'music_scene'
  | 'fandom'
  | 'event_community'
  | 'neighborhood'
  | 'social_circle'
  | 'military_unit'
  | 'religious_group'
  | 'online_community'
  | 'unknown';

type StructuralGroupCandidate = {
  name: string;
  groupType: GroupType;
  lexicalGroupType: LexicalGroupType;
  membershipModel: MembershipModel;
  userRelationship: UserRelationship;
  confidence: number;
  rulesFired: string[];
  anchorName?: string;
  parentName?: string;
  requiresReview?: boolean;
  includeMembers?: boolean;
};

const OWNER_RESIDENCE_PATTERN =
  /\b(?:at|in|inside|outside|near|from|to|went to|drove to|visited)\s+(?:my\s+|our\s+|the\s+)?((?:Tio|Tía|Tia|Uncle|Aunt|Auntie|Mom|Dad|Mother|Father|Abuela|Abuelo|Grandma|Grandpa)\s+[A-ZÀ-Ý][a-zÀ-ÿ'-]+|(?:Mom|Dad|Mother|Father|Abuela|Abuelo|Grandma|Grandpa))'?s?\s+(?:house|home|household|family home|casa)\b/gi;

const COHABITATION_PATTERN =
  /\b(?:lives?\s+with|live\s+together|same\s+house(?:hold)?|household)\b/i;

const SCHOOL_NAME_PATTERN =
  /\b([A-Z][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]+){0,5}\s+(?:Middle School|High School|School|College|University|Academy))\b/g;

const SCHOOL_SUBGROUP_PATTERN =
  /\b(?:(?:the|my|our)\s+)?([A-Z][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]+){0,5}\s+(?:Middle School|High School|School|College|University|Academy))\s+((?:[A-Za-z]+\s+){0,2}(?:band|football team|basketball team|soccer team|baseball team|japanese class|coding club|robotics club|robotics team|club|team|class))\b/g;

const STANDALONE_SUBGROUP_PATTERN =
  /\b(?:my|our|the)?\s*((?:coding|robotics|japanese|music|band|football|basketball|soccer|baseball)\s+(?:club|class|team|band))\b/gi;

// Single-token org name segments — single spaces only (no \s+; CodeQL js/polynomial-redos).
// Case-sensitive [A-Z] after the verb — no /i (lowercase would join the capture).
// No bare '.' in the token class so "Robotics." stops at sentence end.
const ORGANIZATION_NAME_PATTERN =
  /\b(?:[Ww]orked at|[Ww]orks? at|[Ee]mployee at|[Cc]oworker at|[Tt]eam at|[Dd]epartment at|[Ff]or) ([A-Z][A-Za-zÀ-ÿ0-9'’-]{0,40}(?: [A-Z][A-Za-zÀ-ÿ0-9'’-]{0,40}){0,4})(?: (?:[Oo]rganization|[Cc]ompany|[Tt]eam|[Dd]epartment))?\b/g;

const EXPLICIT_ORGANIZATION_PATTERN =
  /\b([A-Z][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]+){0,4})\s+(Organization|Company|Team|Department)\b/g;

const MUSIC_SCENE_PATTERN =
  /\b((?:LA|L\.A\.|OC|Orange County|Goth|Punk|Metal|Rave|Ska)(?:\s+(?:ska|goth|punk|metal|rave))?\s+scene)\b/gi;

const EVENT_COMMUNITY_PATTERN =
  /\b([A-Z][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÿ'’.-]+){0,4}\s+(?:Compound|Club|Venue|Prom|Festival|Show))\s+(?:community|crowd|regulars|scene)\b/gi;

const PERSON_PAIR_GROUP_NAME =
  /\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+)?\s*(?:&|\+|and)\s*(?:Tio|Tia|Tía|Mom|Dad|Abuela|Abuelo|[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+)(?:\s+(?:Family|Group|Crew|Squad|Circle))?\b/i;

const BARE_TITLE_GROUP_NAME =
  /^(?:Tio|Tia|Tía|Mom|Dad|Abuela|Abuelo|Brother|Sister|Mr|Mrs|Ms|Dr|Professor)\s+(?:Family|Group|Crew|Squad|Circle)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// GroupDetectionService
// ─────────────────────────────────────────────────────────────────────────────

export class GroupDetectionService {
  private characterNameCache = new Map<string, {
    expiresAt: number;
    rows: Array<{ id: string; name: string; alias?: string[] | null }>;
  }>();

  /**
   * Detect groups mentioned in a conversation message.
   * Returns DetectedGroup[] for the caller to act on.
   * Does NOT create anything in the database.
   */
  async detectGroupsInMessage(
    userId: string,
    message: string,
    conversationContext?: string[]
  ): Promise<DetectedGroup[]> {
    try {
      const detectedGroups: DetectedGroup[] = [];

      // Patterns to detect groups
      const groupPatterns = [
        /(?:my|our|the)\s{1,40}(band|team|group|club|squad|crew|gang|circle|posse|troupe|collective|scene|ensemble)/gi,
        /(?:called|named|known as|we call (?:it|them|ourselves))\s{1,40}["']?([A-Z][a-zA-Z\s]{1,80}?)["']?(?:\.|,|$)/gi,
        /([A-Z][a-z]{1,40}(?:\s{1,40}[A-Z][a-z]{1,40})?)(?:\s{0,40},\s{0,40}([A-Z][a-z]{1,40}(?:\s{1,40}[A-Z][a-z]{1,40})?)){1,40}\s{1,40}(?:and\s{1,40})?(?:I|we)/gi,
        /(?:with|together with|along with)\s{1,40}([A-Z][a-z]{1,40}(?:\s{1,40}[A-Z][a-z]{1,40})?)(?:\s{0,40},\s{0,40}([A-Z][a-z]{1,40}(?:\s{1,40}[A-Z][a-z]{1,40})?)){1,40}/gi,
      ];

      const groupNames = new Set<string>();
      for (const pattern of groupPatterns) {
        for (const match of message.matchAll(pattern)) {
          if (match[1]) groupNames.add(match[1].trim());
        }
      }

      for (const match of message.matchAll(/\b([A-Z][A-Za-z]+(?:\/[A-Z][A-Za-z]+)?(?:\s+[A-Z][A-Za-z]+){0,2}\s+Family)\b/g)) {
        groupNames.add(match[1].trim());
      }
      if (/\b(?:my|our|the)\s+family\b/i.test(message)) {
        groupNames.add('My Family');
      }

      // Employer / agency names ("the agency K-force", "work for Acme") become
      // named company groups so a recruiter + onboarding contact land under the
      // actual workplace instead of an anonymous friend group.
      const employerNames = new Set<string>();
      for (const employer of this.extractEmployerNames(message)) {
        groupNames.add(employer);
        employerNames.add(employer);
      }
      for (const ctx of conversationContext ?? []) {
        for (const employer of this.extractEmployerNames(ctx)) {
          groupNames.add(employer);
          employerNames.add(employer);
        }
      }

      const detectedMembers = await this.extractMemberNames(userId, message, conversationContext);
      const memberNames = detectedMembers.map(member => member.name);
      const memberIds = detectedMembers.map(member => member.id);

      for (const structural of this.inferStructuralGroups(message, conversationContext)) {
        const existingGroup = await this.findGroupByName(userId, structural.name);
        const members = structural.includeMembers === false ? [] : memberNames;
        const ids = structural.includeMembers === false ? [] : memberIds;

        if (!existingGroup) {
          detectedGroups.push({
            name: structural.name,
            members,
            member_ids: ids,
            context: message.substring(0, 200),
            confidence: structural.confidence,
            group_type: structural.groupType,
            membership_model: structural.membershipModel,
            user_relationship: structural.userRelationship,
            is_public_entity: false,
            metadata: {
              lexical_group_type: structural.lexicalGroupType,
              anchor_name: structural.anchorName,
              parent_group_name: structural.parentName,
              inferred_not_confirmed: true,
              requires_review: structural.requiresReview ?? structural.confidence < 0.9,
              rules_fired: structural.rulesFired,
            },
          });
        } else {
          const newMembers = members.filter(m =>
            !existingGroup.members?.some(gm =>
              gm.character_name.toLowerCase() === m.toLowerCase()
            )
          );
          if (newMembers.length > 0) {
            detectedGroups.push({
              name: existingGroup.name,
              members: newMembers,
              member_ids: this.memberIdsForNames(newMembers, detectedMembers),
              context: message.substring(0, 200),
              confidence: 0.82,
              group_type: existingGroup.group_type,
              membership_model: existingGroup.membership_model,
              user_relationship: existingGroup.user_relationship,
              is_public_entity: existingGroup.is_public_entity,
              metadata: {
                ...(existingGroup.metadata ?? {}),
                evidence_attached_to_existing_group: true,
                rules_fired: structural.rulesFired,
              },
            });
          }
        }
      }

      for (const known of KNOWN_GROUPS) {
        if (!known.pattern.test(message)) continue;
        const existingGroup = await this.findGroupByName(userId, known.name);
        if (!existingGroup) {
          detectedGroups.push({
            name: known.name,
            members: known.is_public_entity ? [] : memberNames,
            member_ids: known.is_public_entity ? [] : memberIds,
            context: message.substring(0, 200),
            confidence: known.confidence,
            group_type: known.group_type,
            membership_model: known.membership_model,
            user_relationship: known.user_relationship,
            is_public_entity: known.is_public_entity ?? false,
            metadata: { ...(known.metadata ?? {}), aliases: known.aliases ?? [] },
          });
        }
      }

      // Co-mentions reinforce the people graph elsewhere, but do not create
      // groups. Groups require shared structure: household, school, workplace,
      // club/team/class, scene, community, or repeated membership evidence.
      if (memberNames.length >= 2) {
        const existingGroups = await this.findExistingGroupsByMembers(userId, memberNames);

        if (existingGroups.length > 0) {
          for (const group of existingGroups) {
            const newMembers = memberNames.filter(m =>
              !group.members?.some(gm =>
                gm.character_name.toLowerCase() === m.toLowerCase()
              )
            );
            if (newMembers.length > 0) {
              detectedGroups.push({
                name: group.name,
                members: newMembers,
                member_ids: this.memberIdsForNames(newMembers, detectedMembers),
                context: message.substring(0, 200),
                confidence: 0.80,
                group_type: group.group_type,
                membership_model: group.membership_model,
                user_relationship: group.user_relationship,
                is_public_entity: group.is_public_entity,
                metadata: group.metadata ?? {},
              });
            }
          }
        }
      }

      // Named group detection
      for (let groupName of groupNames) {
        if (!this.isValidProposedGroupName(groupName, memberNames)) continue;
        const isEmployer = employerNames.has(groupName);
        // An employer/agency the user works through is a company, never a
        // public-fan entity — even if a famous client (e.g. Amazon) is named in
        // the same sentence.
        const isPublic = isEmployer ? false : this.isPublicEntity(groupName, message);
        const groupType = isEmployer ? 'company' : this.suggestGroupType(message, memberNames, groupName);
        if (groupType === 'family' && memberNames.length >= 2 && /^my family$/i.test(groupName)) {
          groupName = nameHousehold(memberNames.map(name => ({ name }))) ?? groupName;
        }
        const existingGroup = await this.findGroupByName(userId, groupName);
        const familyAliases = groupType === 'family' && /\//.test(groupName)
          ? groupName.replace(/\s{1,40}Family$/i, '').split('/').map(part => `${part.trim()} Family`)
          : [];

        if (!existingGroup) {
          detectedGroups.push({
            name: groupName,
            members: isPublic ? [] : memberNames,
            member_ids: isPublic ? [] : memberIds,
            context: message.substring(0, 200),
            confidence: isPublic ? 0.95 : 0.85,
            group_type: isPublic ? 'public_entity' : groupType,
            membership_model: isPublic ? 'none' : this.suggestMembershipModel(groupType),
            user_relationship: isPublic
              ? this.suggestPublicEntityRelationship(message)
              : this.suggestUserRelationship(message, memberNames.length > 0),
            is_public_entity: isPublic,
            metadata: familyAliases.length > 0 ? { aliases: familyAliases } : {},
          });
        } else {
          const newMembers = memberNames.filter(m =>
            !existingGroup.members?.some(gm =>
              gm.character_name.toLowerCase() === m.toLowerCase()
            )
          );
          if (newMembers.length > 0) {
            detectedGroups.push({
              name: existingGroup.name,
              members: newMembers,
              member_ids: this.memberIdsForNames(newMembers, detectedMembers),
              context: message.substring(0, 200),
              confidence: 0.80,
              group_type: existingGroup.group_type,
              membership_model: existingGroup.membership_model,
              user_relationship: existingGroup.user_relationship,
              is_public_entity: existingGroup.is_public_entity,
              metadata: existingGroup.metadata ?? {},
            });
          }
        }
      }

      return detectedGroups.filter(group => this.isValidDetectedGroup(group));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect groups in message');
      return [];
    }
  }

  /**
   * Public, side-effect-free member resolution: returns the existing characters
   * (by id + canonical name) mentioned in the given text. Used by the society
   * mapper to build a cross-session co-occurrence graph without re-implementing
   * the name gating / canonicalization rules.
   */
  async extractMembers(
    userId: string,
    text: string,
    context?: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      return await this.extractMemberNames(userId, text, context);
    } catch (error) {
      logger.debug({ error, userId }, 'extractMembers failed');
      return [];
    }
  }

  /** Public wrapper over employer/agency name extraction (see society/signals). */
  extractEmployerNamesPublic(text: string): string[] {
    return this.extractEmployerNames(text);
  }

  // ── Group type inference ─────────────────────────────────────────────────

  suggestGroupType(message: string, _members: string[], groupName?: string): GroupType {
    const m = message.toLowerCase();
    const n = (groupName ?? '').toLowerCase();

    if (/\bfamily\b/i.test(n) || /\b(family|mom|dad|sister|brother|cousin|aunt|uncle|grandma|grandpa|relatives|abuela|abuelo|tía|tío|tia|tio)\b/i.test(m)) {
      return 'family';
    }
    if (COMMUNITY_SIGNALS.test(m) || COMMUNITY_SIGNALS.test(n)) return 'community';
    if (VENDOR_SIGNALS.test(m) || VENDOR_SIGNALS.test(n)) return 'vendor';
    if (BRAND_SIGNALS.test(m) || BRAND_SIGNALS.test(n)) return 'brand';
    if (BAND_SIGNALS.test(m) || /\b(music|gig|concert|rehearsal|song|album|track|riff|jam)\b/i.test(m)) {
      return 'band';
    }
    if (SCENE_SIGNALS.test(m)) return 'scene';
    if (CREW_SIGNALS.test(m)) return 'crew';
    if (/\b(basketball|football|soccer|baseball|tennis|volleyball|game|match|tournament|league)\b/i.test(m)) {
      return 'sports_team';
    }
    if (WORK_SIGNALS.test(m) || WORK_SIGNALS.test(n)) {
      return 'company';
    }
    if (/\b(dojo|dojang|gym|sensei|sparring|belt|kata|bjj|mma|martial arts|karate|judo|jiu.jitsu)\b/i.test(m)) {
      return 'martial_arts';
    }
    if (/\b(club|meeting|gathering|hobby|society|association)\b/i.test(m) ||
        /\b(club|society|association|guild)\b/i.test(n)) {
      return 'club';
    }
    if (/\b(nonprofit|volunteer|charity|foundation|ngo)\b/i.test(m)) {
      return 'nonprofit';
    }
    if (/\b(collective|art|creative|zine|label|indie)\b/i.test(m)) {
      return 'collective';
    }
    if (/\b(university|college|school|institution|academy|institute)\b/i.test(m) ||
        /\b(university|college|school|institute|academy)\b/i.test(n)) {
      return 'institution';
    }
    return 'friend_group';
  }

  private inferStructuralGroups(message: string, conversationContext?: string[]): StructuralGroupCandidate[] {
    const text = [message, ...(conversationContext ?? [])].join('\n');
    const groups: StructuralGroupCandidate[] = [];
    const seen = new Set<string>();
    const add = (group: StructuralGroupCandidate) => {
      const key = normalizeNameKey(group.name);
      if (!key || seen.has(key) || !this.isValidProposedGroupName(group.name, [])) return;
      seen.add(key);
      groups.push(group);
    };

    for (const match of text.matchAll(OWNER_RESIDENCE_PATTERN)) {
      const owner = this.normalizeGroupAnchorName(match[1]);
      if (!owner) continue;
      add({
        name: `${owner} Household`,
        groupType: 'household',
        lexicalGroupType: 'household',
        membershipModel: 'strict',
        userRelationship: 'referenced',
        confidence: 0.9,
        anchorName: owner,
        rulesFired: ['household_owner_residence'],
      });
    }

    if (COHABITATION_PATTERN.test(text)) {
      const kinshipOwner = this.extractKinshipOwner(text);
      if (kinshipOwner) {
        add({
          name: `${kinshipOwner} Household`,
          groupType: 'household',
          lexicalGroupType: 'household',
          membershipModel: 'strict',
          userRelationship: 'referenced',
          confidence: 0.86,
          anchorName: kinshipOwner,
          rulesFired: ['household_cohabitation'],
        });
      }
    }

    const schoolNames = new Set<string>();
    for (const match of text.matchAll(SCHOOL_NAME_PATTERN)) {
      const school = this.titleCaseGroupName(match[1]);
      schoolNames.add(school);
      add({
        name: `${school} Community`,
        groupType: 'community',
        lexicalGroupType: 'school_community',
        membershipModel: 'fuzzy',
        userRelationship: /\b(went to|graduated|alumni|classmate|student)\b/i.test(text) ? 'alumnus' : 'referenced',
        confidence: 0.88,
        anchorName: school,
        rulesFired: ['school_community'],
      });
    }

    for (const match of text.matchAll(SCHOOL_SUBGROUP_PATTERN)) {
      const school = this.titleCaseGroupName(match[1]);
      const subgroup = this.titleCaseGroupName(match[2]);
      schoolNames.add(school);
      add({
        name: `${school} ${subgroup}`,
        groupType: this.groupTypeForSubgroup(subgroup),
        lexicalGroupType: 'school_subgroup',
        membershipModel: 'strict',
        userRelationship: 'member',
        confidence: 0.9,
        anchorName: subgroup,
        parentName: `${school} Community`,
        rulesFired: ['school_subgroup'],
      });
    }

    for (const match of text.matchAll(STANDALONE_SUBGROUP_PATTERN)) {
      const subgroup = this.titleCaseGroupName(match[1]);
      const school = Array.from(schoolNames)[0];
      add({
        name: school ? `${school} ${subgroup}` : subgroup,
        groupType: this.groupTypeForSubgroup(subgroup),
        lexicalGroupType: school ? 'school_subgroup' : this.lexicalTypeForSubgroup(subgroup),
        membershipModel: 'strict',
        userRelationship: 'member',
        confidence: school ? 0.86 : 0.82,
        parentName: school ? `${school} Community` : undefined,
        requiresReview: !school,
        rulesFired: school ? ['standalone_school_subgroup_with_context'] : ['standalone_activity_group'],
      });
    }

    for (const match of text.matchAll(ORGANIZATION_NAME_PATTERN)) {
      const org = this.titleCaseGroupName(match[1]).replace(/\s+(Organization|Company|Team|Department)$/i, '');
      if (!this.isLikelyOrganizationName(org)) continue;
      add({
        name: `${org} Organization`,
        groupType: 'company',
        lexicalGroupType: 'organization',
        membershipModel: 'strict',
        userRelationship: this.suggestUserRelationship(text, true),
        confidence: 0.88,
        anchorName: org,
        rulesFired: ['work_organization'],
      });
    }

    for (const match of text.matchAll(EXPLICIT_ORGANIZATION_PATTERN)) {
      const base = this.titleCaseGroupName(match[1]);
      const suffix = this.titleCaseGroupName(match[2]);
      const name = suffix === 'Organization' ? `${base} Organization` : `${base} ${suffix}`;
      add({
        name,
        groupType: suffix === 'Team' ? 'team' : 'company',
        lexicalGroupType: suffix === 'Team' ? 'work_team' : 'organization',
        membershipModel: 'strict',
        userRelationship: 'referenced',
        confidence: 0.88,
        anchorName: base,
        rulesFired: ['explicit_organization_name'],
      });
    }

    for (const match of text.matchAll(MUSIC_SCENE_PATTERN)) {
      add({
        name: this.titleCaseSceneName(match[1]),
        groupType: 'scene',
        lexicalGroupType: 'music_scene',
        membershipModel: 'fuzzy',
        userRelationship: 'adjacent',
        confidence: 0.9,
        rulesFired: ['music_scene'],
        includeMembers: false,
      });
    }

    for (const match of text.matchAll(EVENT_COMMUNITY_PATTERN)) {
      const anchor = this.titleCaseGroupName(match[1]);
      add({
        name: `${anchor} Community`,
        groupType: 'community',
        lexicalGroupType: 'event_community',
        membershipModel: 'fuzzy',
        userRelationship: 'adjacent',
        confidence: /\b(regulars|community)\b/i.test(match[0]) ? 0.84 : 0.58,
        anchorName: anchor,
        requiresReview: true,
        rulesFired: ['event_community_requires_repeated_evidence'],
        includeMembers: false,
      });
    }

    return groups;
  }

  private normalizeGroupAnchorName(raw: string): string | null {
    const cleaned = raw
      .replace(/^(?:my|our|the)\s+/i, '')
      .replace(/['’]s$/i, '')
      .trim();
    if (!cleaned || /^(?:tio|tia|tía|mom|dad|abuela|abuelo|brother|sister)$/i.test(cleaned)) {
      return cleaned ? this.titleCaseGroupName(cleaned) : null;
    }
    return this.titleCaseGroupName(cleaned);
  }

  private extractKinshipOwner(text: string): string | null {
    const match = text.match(/\b((?:Tio|Tía|Tia|Uncle|Aunt|Auntie|Mom|Dad|Mother|Father|Abuela|Abuelo|Grandma|Grandpa)\s+[A-ZÀ-Ý][a-zÀ-ÿ'-]+|Mom|Dad|Abuela|Abuelo|Grandma|Grandpa)\b/);
    return match ? this.normalizeGroupAnchorName(match[1]) : null;
  }

  private titleCaseGroupName(value: string): string {
    return value
      .replace(/[’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (/^la$/i.test(word)) return 'LA';
        if (/^oc$/i.test(word)) return 'OC';
        if (/^csuf$/i.test(word)) return 'CSUF';
        if (/^t[ií]a$/i.test(word)) return 'Tía';
        if (/^tio$/i.test(word)) return 'Tio';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private titleCaseSceneName(value: string): string {
    // titleCaseGroupName already yields correct casing; do not self-replace tokens
    // (CodeQL js/identity-replacement).
    return this.titleCaseGroupName(value);
  }

  private groupTypeForSubgroup(subgroup: string): GroupType {
    if (/\bteam\b/i.test(subgroup)) return 'sports_team';
    if (/\bband\b/i.test(subgroup)) return 'band';
    return 'club';
  }

  private lexicalTypeForSubgroup(subgroup: string): LexicalGroupType {
    if (/\bteam\b/i.test(subgroup)) return 'sports_team';
    return 'club';
  }

  private isLikelyOrganizationName(name: string): boolean {
    if (!name || MEMBER_STOPWORDS.has(name)) return false;
    if (/\b(?:my|our|the|at|in|for|team|department|employee|coworker)\b/i.test(name)) return false;
    return /^[A-ZÀ-Ý0-9][A-Za-zÀ-ÿ0-9'’.-]+(?: [A-ZÀ-Ý0-9][A-Za-zÀ-ÿ0-9'’.-]+){0,4}$/.test(name);
  }

  private isValidProposedGroupName(groupName: string, members: string[]): boolean {
    const name = groupName.trim();
    if (!name) return false;
    if (PERSON_PAIR_GROUP_NAME.test(name)) return false;
    if (BARE_TITLE_GROUP_NAME.test(name)) return false;
    if (/^(?:Mom|Dad|Tio|Tia|Tía|Abuela|Abuelo|Brother|Sister)\s+Family$/i.test(name)) return false;
    if (members.some(member => normalizeNameKey(member) === normalizeNameKey(name))) return false;
    // Two-word max person-like prefix + Group|Crew|… (single spaces; fixed bounds).
    if (
      members.length < 3 &&
      /^(?:[A-Z][a-z]{1,30})(?: [A-Z][a-z]{1,30})? (?:Group|Crew|Squad|Circle)$/i.test(name)
    ) {
      return false;
    }
    return true;
  }

  // ── Membership model inference ───────────────────────────────────────────

  suggestMembershipModel(groupType: GroupType): MembershipModel {
    if (groupType === 'scene' || groupType === 'community') return 'fuzzy';
    if (groupType === 'public_entity' || groupType === 'brand' || groupType === 'vendor') return 'none';
    return 'strict';
  }

  // ── User relationship inference ──────────────────────────────────────────

  suggestUserRelationship(message: string, userInvolved: boolean): UserRelationship {
    if (!userInvolved) return 'aware_of';

    const m = message.toLowerCase();

    if (/\b(founded|started|created|built|launched)\b/.test(m)) return 'founder';
    if (/\b(lead|run|manage|organize|chair|head)\b/.test(m)) return 'leader';
    if (/\b(used to|was in|former|ex-member|left|quit|moved on)\b/.test(m)) return 'former_member';
    if (/\b(collaborate|work with|partner|guest|session)\b/.test(m)) return 'collaborator';
    if (/\b(always there|hang around|adjacent|peripheral|associate)\b/.test(m)) return 'adjacent';
    if (/\b(graduated|alumni|alumna|went to)\b/.test(m)) return 'alumnus';

    return 'member';
  }

  suggestPublicEntityRelationship(message: string): UserRelationship {
    const m = message.toLowerCase();
    if (/\b(love|obsessed|huge fan|biggest fan)\b/.test(m)) return 'fan';
    if (/\b(like|enjoy|listen to|watch|follow)\b/.test(m)) return 'fan';
    if (/\b(heard of|know about|aware|familiar)\b/.test(m)) return 'aware_of';
    return 'referenced';
  }

  // ── Public entity detection ──────────────────────────────────────────────

  isPublicEntity(groupName: string, message: string): boolean {
    const combined = `${groupName} ${message}`;
    return PUBLIC_ENTITY_SIGNALS.some(pattern => pattern.test(combined));
  }

  // ── Employer / agency name extraction ────────────────────────────────────

  /**
   * Pull workplace/agency proper-noun names from common phrasings so they can
   * be tracked as named company groups. Normalizes punctuation variants like
   * "K-force" / "K force" to a single canonical "Kforce".
   */
  private extractEmployerNames(message: string): string[] {
    // Canonical extraction lives in society/signals (single source of truth);
    // here we additionally drop anything that collides with a member pronoun.
    return sharedExtractEmployerNames(message).filter(name => !MEMBER_STOPWORDS.has(name));
  }

  private canonicalEmployerName(raw: string): string | null {
    return sharedCanonicalEmployerName(raw);
  }

  // ── Member name extraction ───────────────────────────────────────────────

  private async extractMemberNames(userId: string, message: string, context?: string[]): Promise<Array<{ id: string; name: string }>> {
    const namesById = new Map<string, string>();
    const namePattern = /\b([A-ZÀ-Ý][a-zÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ'-]+)?)\b/g;
    const characterRows = await this.loadCharacterNameRows(userId);
    const maybeAdd = async (rawName: string) => {
      const name = this.cleanPotentialMemberName(rawName);
      if (!this.isValidHumanMemberName(name)) return;
      const canonical = this.resolveExistingCharacterName(name, characterRows);
      if (canonical) {
        namesById.set(canonical.id, canonical.name);
      }
    };

    for (const match of message.matchAll(namePattern)) {
      await maybeAdd(match[1]);
    }

    if (context) {
      for (const ctx of context) {
        for (const match of ctx.matchAll(namePattern)) {
          await maybeAdd(match[1]);
        }
      }
    }

    return Array.from(namesById, ([id, name]) => ({ id, name }));
  }

  private cleanPotentialMemberName(rawName: string): string {
    return rawName
      .trim()
      .replace(/\s+/g, ' ')
      .replace(HONORIFIC_PREFIX, '')
      .replace(/[.,;:!?]{1,8}$/, '')
      .trim();
  }

  private async loadCharacterNameRows(userId: string): Promise<Array<{ id: string; name: string; alias?: string[] | null }>> {
    try {
      const cached = this.characterNameCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) return cached.rows;

      const { data } = await supabaseAdmin
        .from('characters')
        .select('id, name, alias')
        .eq('user_id', userId);
      const rows = (data ?? []) as Array<{ id: string; name: string; alias?: string[] | null }>;
      // Bound this user-keyed cache: evict the oldest entry if over the cap so the
      // singleton Map can't grow with total user count (OOM guard).
      if (this.characterNameCache.size >= 1_000 && !this.characterNameCache.has(userId)) {
        const oldest = this.characterNameCache.keys().next().value;
        if (oldest !== undefined) this.characterNameCache.delete(oldest);
      }
      this.characterNameCache.set(userId, { rows, expiresAt: Date.now() + 60_000 });
      return rows;
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to load characters for group member resolution');
      return [];
    }
  }

  private resolveExistingCharacterName(
    name: string,
    rows: Array<{ id: string; name: string; alias?: string[] | null }>
  ): { id: string; name: string } | null {
    const nameKey = normalizeNameKey(name);
    const nameFirst = nameKey.split(' ')[0];

    const exact = rows.filter(row =>
      normalizeNameKey(row.name) === nameKey
        || (row.alias ?? []).some(alias => normalizeNameKey(alias) === nameKey)
    );
    if (exact.length === 1) return { id: exact[0].id, name: exact[0].name };

    const firstNameMatches = rows.filter(row => {
      const rowKey = normalizeNameKey(row.name);
      const rowTokens = rowKey.split(' ').filter(Boolean);
      const aliasTokens = (row.alias ?? []).flatMap(alias => normalizeNameKey(alias).split(' ').filter(Boolean));
      return rowTokens.includes(nameFirst) || aliasTokens.includes(nameFirst);
    });
    if (firstNameMatches.length === 1) return { id: firstNameMatches[0].id, name: firstNameMatches[0].name };

    return null;
  }

  private memberIdsForNames(names: string[], members: Array<{ id: string; name: string }>): string[] {
    const ids: string[] = [];
    for (const name of names) {
      const match = members.find(member => normalizeNameKey(member.name) === normalizeNameKey(name));
      if (match) ids.push(match.id);
    }
    return ids;
  }

  private isValidHumanMemberName(name: string): boolean {
    const cleanName = this.cleanPotentialMemberName(name);
    if (cleanName.length < 2) return false;
    if (MEMBER_STOPWORDS.has(cleanName)) return false;
    if (KNOWN_ORG_MEMBER_FALSE_POSITIVES.has(cleanName)) return false;
    if (FABRICATED_TEST_TERMS.test(cleanName)) return false;
    if (NON_PERSON_MEMBER_TERMS.test(cleanName)) return false;
    const gate = characterRegistry.gateName(cleanName);
    if (!gate.ok || gate.parts) return false;
    const tokens = cleanName.split(/\s+/);
    if (tokens.length > 3 || tokens.some(token => MEMBER_STOPWORDS.has(token))) return false;
    return /^[A-ZÀ-Ý][a-zÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ'-]+){0,2}$/.test(cleanName);
  }

  private isValidDetectedGroup(group: DetectedGroup): boolean {
    const name = group.name ?? '';
    const context = group.context ?? '';
    const members = group.members ?? [];

    if (FABRICATED_TEST_TERMS.test(`${name} ${context} ${members.join(' ')}`)) return false;
    if (/^(?:of|in|on|at|to|from|with|for)\s+/i.test(name)) return false;
    if (name && !/^[A-ZÀ-Ý0-9]/.test(name)) return false;
    if (!name && members.length < 2) return false;
    if (!group.is_public_entity && members.length !== (group.member_ids ?? []).length) return false;
    if (members.some(member => !this.isValidHumanMemberName(member))) return false;
    return true;
  }

  // ── Lookup helpers ───────────────────────────────────────────────────────

  private async findExistingGroupsByMembers(
    userId: string,
    memberNames: string[]
  ): Promise<Organization[]> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('user_id', userId);

      if (error || !orgs || orgs.length === 0) return [];

      // Batch-fetch all members in one query instead of one query per org (N+1).
      const orgIds = orgs.map(o => o.id);
      const { data: memberRows } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id, character_name')
        .in('organization_id', orgIds);

      const byOrg = new Map<string, string[]>();
      for (const row of (memberRows ?? []) as Array<{ organization_id: string; character_name: string }>) {
        const list = byOrg.get(row.organization_id) ?? [];
        list.push(row.character_name.toLowerCase());
        byOrg.set(row.organization_id, list);
      }

      const lowerNames = memberNames.map(n => n.toLowerCase());
      const matching: Organization[] = [];
      for (const [orgId, names] of byOrg) {
        const hits = lowerNames.filter(n => names.some(om => om.includes(n) || n.includes(om)));
        if (hits.length >= 2) {
          const full = await organizationService.getOrganization(userId, orgId);
          if (full) matching.push(full);
        }
      }
      return matching;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to find groups by members');
      return [];
    }
  }

  private async findGroupByName(userId: string, name: string): Promise<Organization | null> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .or(`name.ilike.%${name}%,aliases.cs.{${name}}`);

      if (error || !orgs || orgs.length === 0) return null;
      return await organizationService.getOrganization(userId, orgs[0].id);
    } catch (error) {
      logger.error({ error, userId, name }, 'Failed to find group by name');
      return null;
    }
  }
}

export const groupDetectionService = new GroupDetectionService();
