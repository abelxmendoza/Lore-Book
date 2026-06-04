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

import {
  organizationService,
  type Organization,
  type GroupType,
  type MembershipModel,
  type UserRelationship,
} from './organizationService';
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
  context: string;
  confidence: number;

  // G1 canonical fields
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// GroupDetectionService
// ─────────────────────────────────────────────────────────────────────────────

export class GroupDetectionService {
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

      const memberNames = this.extractMemberNames(message, conversationContext);

      // Unnamed group from co-mention clustering
      if (memberNames.length >= 2) {
        const existingGroups = await this.findExistingGroupsByMembers(userId, memberNames);

        if (existingGroups.length === 0) {
          const groupType = this.suggestGroupType(message, memberNames);
          detectedGroups.push({
            members: memberNames,
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
                context: message.substring(0, 200),
                confidence: 0.80,
                group_type: group.group_type,
                membership_model: group.membership_model,
                user_relationship: group.user_relationship,
                is_public_entity: group.is_public_entity,
              });
            }
          }
        }
      }

      // Named group detection
      for (const groupName of groupNames) {
        const isPublic = this.isPublicEntity(groupName, message);
        const groupType = this.suggestGroupType(message, memberNames, groupName);
        const existingGroup = await this.findGroupByName(userId, groupName);

        if (!existingGroup) {
          detectedGroups.push({
            name: groupName,
            members: isPublic ? [] : memberNames,
            context: message.substring(0, 200),
            confidence: isPublic ? 0.95 : 0.85,
            group_type: isPublic ? 'public_entity' : groupType,
            membership_model: isPublic ? 'none' : this.suggestMembershipModel(groupType),
            user_relationship: isPublic
              ? this.suggestPublicEntityRelationship(message)
              : this.suggestUserRelationship(message, memberNames.length > 0),
            is_public_entity: isPublic,
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
              context: message.substring(0, 200),
              confidence: 0.80,
              group_type: existingGroup.group_type,
              membership_model: existingGroup.membership_model,
              user_relationship: existingGroup.user_relationship,
              is_public_entity: existingGroup.is_public_entity,
            });
          }
        }
      }

      return detectedGroups;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect groups in message');
      return [];
    }
  }

  // ── Group type inference ─────────────────────────────────────────────────

  suggestGroupType(message: string, _members: string[], groupName?: string): GroupType {
    const m = message.toLowerCase();
    const n = (groupName ?? '').toLowerCase();

    if (BAND_SIGNALS.test(m) || /\b(music|gig|concert|rehearsal|song|album|track|riff|jam)\b/i.test(m)) {
      return 'band';
    }
    if (SCENE_SIGNALS.test(m)) return 'scene';
    if (CREW_SIGNALS.test(m)) return 'crew';
    if (/\b(basketball|football|soccer|baseball|tennis|volleyball|game|match|tournament|league)\b/i.test(m)) {
      return 'sports_team';
    }
    if (/\b(work|office|company|colleague|startup|business|job|employer|corp)\b/i.test(m)) {
      return 'company';
    }
    if (/\b(family|mom|dad|sister|brother|cousin|aunt|uncle|grandma|grandpa|relatives)\b/i.test(m)) {
      return 'family';
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
    if (groupType === 'scene') return 'fuzzy';
    if (groupType === 'public_entity') return 'none';
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

  // ── Member name extraction ───────────────────────────────────────────────

  private extractMemberNames(message: string, context?: string[]): string[] {
    const names = new Set<string>();
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const excludeWords = new Set([
      'I', 'We', 'You', 'They', 'The', 'This', 'That', 'There', 'Here',
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December',
      'Today', 'Tomorrow', 'Yesterday', 'Now', 'Then',
    ]);

    for (const match of message.matchAll(namePattern)) {
      const name = match[1].trim();
      if (!excludeWords.has(name) && name.length > 1) names.add(name);
    }

    if (context) {
      for (const ctx of context) {
        for (const match of ctx.matchAll(namePattern)) {
          const name = match[1].trim();
          if (!excludeWords.has(name) && name.length > 1) names.add(name);
        }
      }
    }

    return Array.from(names);
  }

  // ── Lookup helpers ───────────────────────────────────────────────────────

  private async findExistingGroupsByMembers(
    userId: string,
    memberNames: string[]
  ): Promise<Organization[]> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('id, name, group_type, membership_model, user_relationship, is_public_entity, type')
        .eq('user_id', userId);

      if (error || !orgs) return [];

      const matching: Organization[] = [];
      for (const org of orgs) {
        const members = await organizationService.getMembers(org.id);
        const orgMemberNames = members.map(m => m.character_name.toLowerCase());
        const hits = memberNames.filter(n =>
          orgMemberNames.some(om => om.includes(n.toLowerCase()) || n.toLowerCase().includes(om))
        );
        if (hits.length >= 2) {
          const full = await organizationService.getOrganization(userId, org.id);
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
