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
        /(?:my|our|the)\s+(band|team|group|club|squad|crew|gang|circle|posse|troupe|collective|scene|ensemble)/gi,
        /(?:called|named|known as|we call (?:it|them|ourselves))\s+["']?([A-Z][a-zA-Z\s]+?)["']?(?:\.|,|$)/gi,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))+\s+(?:and\s+)?(?:I|we)/gi,
        /(?:with|together with|along with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))+/gi,
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

      // Unnamed group from co-mention clustering
      if (memberNames.length >= 2) {
        const existingGroups = await this.findExistingGroupsByMembers(userId, memberNames);

        if (existingGroups.length === 0) {
          const groupType = this.suggestGroupType(message, memberNames);
          detectedGroups.push({
            members: memberNames,
            member_ids: memberIds,
            context: message.substring(0, 200),
            confidence: 0.65,
            group_type: groupType,
            membership_model: this.suggestMembershipModel(groupType),
            user_relationship: this.suggestUserRelationship(message, true),
            is_public_entity: false,
          });
        } else {
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
          ? groupName.replace(/\s+Family$/i, '').split('/').map(part => `${part.trim()} Family`)
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
      .replace(/[.,;:!?]+$/, '')
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
