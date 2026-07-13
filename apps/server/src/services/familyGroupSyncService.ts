/**
 * Family-group sync — a family-type group and its members' relationship
 * graphs should tell the same story.
 *
 * On accept/rename/member-change of a group this service:
 *  1. links characters whose names appear in the group TITLE as members
 *     (the group "knows" who it is named after),
 *  2. fills empty member roles from kinship titles in their names
 *     ("Tio Ralph" → role "uncle") so the family roster reads as one,
 *  3. for group_type='family', ensures every pair of member characters is
 *     connected with a family edge in character_relationships — so each
 *     member's family tree shows the same household.
 *
 * All writes are additive and marked inferred; user-set values are never
 * overwritten.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

const KINSHIP_ROLES: Array<[RegExp, string]> = [
  [/(^|\s)(t[ií]o|uncle)(\s|$)/i, 'uncle'],
  [/(^|\s)(t[ií]a|aunt|auntie)(\s|$)/i, 'aunt'],
  [/(^|\s)(abuel[oa]|grand(ma|pa|mother|father))(\s|$)/i, 'grandparent'],
  [/(^|\s)(mom|mother|mama)(\s|$)/i, 'mother'],
  [/(^|\s)(dad|father|papa)(\s|$)/i, 'father'],
  [/(^|\s)(prim[oa]|cousin)(\s|$)/i, 'cousin'],
  [/(^|\s)(herman[oa]|brother|sister)(\s|$)/i, 'sibling'],
  [/(^|\s)(sobrin[oa]|nephew|niece)(\s|$)/i, 'nibling'],
  [/(^|\s)step\s?(mom|dad|mother|father)(\s|$)/i, 'step-parent'],
];

/** Kinship role from a display name ("Tio Ralph" → "uncle"). Pure. */
export function kinshipRoleFromName(name: string): string | null {
  for (const [re, role] of KINSHIP_ROLES) {
    if (re.test(name)) return role;
  }
  return null;
}

const TITLE_STOPWORDS = new Set([
  'family', 'house', 'household', 'crew', 'gang', 'squad', 'team', 'group',
  'the', 'and', 'de', 'la', 'los', 'las', 'del', 'famila', 'familia',
  'tio', 'tía', 'tia', 'tío', 'uncle', 'aunt', 'abuela', 'abuelo',
]);

function normalizeToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]s\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Which known characters does a group title mention? Conservative: a
 * character matches when their full name/alias appears, or a distinctive
 * (non-kinship, non-stopword, 4+ char) token of their name appears as a
 * standalone word in the title. Pure.
 */
export function charactersMentionedInTitle(
  title: string,
  characters: Array<{ id: string; name: string; alias?: string[] | null }>,
): Array<{ id: string; name: string }> {
  const titleNorm = ` ${title.split(/\s+/).map(normalizeToken).filter(Boolean).join(' ')} `;
  const matched: Array<{ id: string; name: string }> = [];

  for (const c of characters) {
    const namesToTry = [c.name, ...(Array.isArray(c.alias) ? c.alias : [])];
    let hit = false;
    for (const candidate of namesToTry) {
      const tokens = candidate.split(/\s+/).map(normalizeToken).filter(Boolean);
      if (tokens.length === 0) continue;
      const full = ` ${tokens.join(' ')} `;
      if (titleNorm.includes(full)) { hit = true; break; }
      for (const token of tokens) {
        if (token.length >= 4 && !TITLE_STOPWORDS.has(token) && titleNorm.includes(` ${token} `)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) matched.push({ id: c.id, name: c.name });
  }
  return matched;
}

class FamilyGroupSyncService {
  /** Run the full sync for one group. Never throws — best-effort enrichment. */
  async syncGroup(userId: string, organizationId: string): Promise<void> {
    try {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, group_type')
        .eq('id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!org) return;

      const [{ data: members }, { data: characters }] = await Promise.all([
        supabaseAdmin
          .from('organization_members')
          .select('id, character_id, character_name, role, notes')
          .eq('user_id', userId)
          .eq('organization_id', organizationId),
        supabaseAdmin
          .from('characters')
          .select('id, name, alias')
          .eq('user_id', userId)
          .limit(1000),
      ]);

      const memberIds = new Set((members ?? []).map((m) => m.character_id).filter(Boolean));

      // 1. Title-mentioned characters become members (the group knows its namesakes).
      for (const mentioned of charactersMentionedInTitle(org.name ?? '', characters ?? [])) {
        if (memberIds.has(mentioned.id)) continue;
        const { error } = await supabaseAdmin.from('organization_members').insert({
          user_id: userId,
          organization_id: organizationId,
          character_id: mentioned.id,
          character_name: mentioned.name,
          role: kinshipRoleFromName(mentioned.name),
          status: 'active',
          notes: `[inferred] named in group title "${org.name}"`,
        });
        if (!error) memberIds.add(mentioned.id);
      }

      // 2. Kinship roles from names, only where role is empty.
      for (const member of members ?? []) {
        if (member.role || !member.character_name) continue;
        const role = kinshipRoleFromName(member.character_name);
        if (role) {
          await supabaseAdmin.from('organization_members').update({ role }).eq('id', member.id);
        }
      }

      // 3. Family groups: every member pair shares a family edge, so each
      //    member's tree/relationships shows the same household.
      if (org.group_type === 'family') {
        const linkedIds = [...memberIds] as string[];
        for (let i = 0; i < linkedIds.length; i++) {
          for (let j = i + 1; j < linkedIds.length; j++) {
            await this.ensureFamilyEdge(userId, linkedIds[i], linkedIds[j], organizationId, org.name);
          }
        }
      }
    } catch (err) {
      logger.debug({ err, organizationId }, 'familyGroupSync failed (non-fatal)');
    }
  }

  private async ensureFamilyEdge(
    userId: string,
    a: string,
    b: string,
    organizationId: string,
    orgName: string,
  ): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${a},target_character_id.eq.${b}),and(source_character_id.eq.${b},target_character_id.eq.${a})`,
      )
      .limit(1)
      .maybeSingle();
    if (existing) return; // any existing edge (family or otherwise) wins

    await supabaseAdmin.from('character_relationships').insert({
      user_id: userId,
      source_character_id: a,
      target_character_id: b,
      relationship_type: 'family',
      relationship_category: 'family',
      status: 'active',
      inference_status: 'inferred',
      summary: `Members of the same family group "${orgName}"`,
      metadata: {
        inferred: true,
        inference_source: 'family_group_sync',
        organization_id: organizationId,
      },
    });
  }
}

export const familyGroupSyncService = new FamilyGroupSyncService();
