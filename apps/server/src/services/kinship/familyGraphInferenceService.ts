/**
 * Kinship graph inference — protagonist edges, family groups, provenance.
 */
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';
import { relationshipFoundationService } from '../relationshipFoundationService';
import { organizationService } from '../organizationService';
import { nameHousehold } from '../entities/householdNaming';
import {
  extractKinshipMentions,
  kinshipRoleToString,
  parseKinshipFromName,
  type KinshipRole,
} from './kinshipGlossary';

type CharacterRow = { id: string; name: string; metadata?: Record<string, unknown> | null };

function resolveCharacterByName(name: string, chars: CharacterRow[]): CharacterRow | null {
  const key = normalizeNameKey(name);
  for (const c of chars) {
    if (normalizeNameKey(c.name) === key) return c;
    const aliases = (c.metadata?.aliases as string[] | undefined) ?? [];
    if (aliases.some((a) => normalizeNameKey(a) === key)) return c;
  }
  const first = name.split(/\s+/).pop()?.toLowerCase();
  if (first && first.length > 2) {
    const matches = chars.filter((c) => normalizeNameKey(c.name).includes(first));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export class FamilyGraphInferenceService {
  /**
   * After entity extraction + character promotion, infer kinship edges and family groups.
   */
  async processMessage(
    userId: string,
    text: string,
    messageId: string,
    promotedCharacterIds: string[]
  ): Promise<{ edges: number; familyGroupId?: string }> {
    let edges = 0;

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);
    if (!chars?.length) return { edges: 0 };

    const charRows = chars as CharacterRow[];
    const protagonist = charRows.find((c) => (c.metadata as Record<string, unknown>)?.is_self === true)
      ?? charRows.find((c) => normalizeNameKey(c.name).includes('self'));

    const kinMentions = extractKinshipMentions(text);
    const kinCharacters: CharacterRow[] = [];

    for (const kin of kinMentions) {
      const row = resolveCharacterByName(kin.sourcePhrase, charRows);
      if (!row) continue;
      kinCharacters.push(row);

      if (protagonist && row.id !== protagonist.id) {
        const created = await relationshipFoundationService.assertProtagonistKinship(
          userId,
          row.id,
          kinshipRoleToString(kin.role),
          messageId,
          kin.confidence
        );
        if (created) edges++;
      }
    }

    for (const charId of promotedCharacterIds) {
      const row = charRows.find((c) => c.id === charId);
      if (!row || !protagonist || row.id === protagonist.id) continue;
      const parsed = parseKinshipFromName(row.name);
      if (!parsed) continue;
      kinCharacters.push(row);
      const created = await relationshipFoundationService.assertProtagonistKinship(
        userId,
        row.id,
        kinshipRoleToString(parsed.role),
        messageId,
        parsed.confidence
      );
      if (created) edges++;
    }

    const uniqueKin = [...new Map(kinCharacters.map((c) => [c.id, c])).values()];
    let familyGroupId: string | undefined;

    if (uniqueKin.length >= 2) {
      familyGroupId = await this.ensureFamilyGroup(userId, uniqueKin, text, messageId);
    }

    if (edges > 0 || familyGroupId) {
      logger.info({ userId, messageId, edges, familyGroupId, kinCount: uniqueKin.length }, 'Kinship graph inference');
    }

    return { edges, familyGroupId };
  }

  private async ensureFamilyGroup(
    userId: string,
    members: CharacterRow[],
    context: string,
    messageId: string
  ): Promise<string | undefined> {
    const memberNames = members.map((m) => m.name);
    const proposedName =
      nameHousehold(members.map((m) => ({ name: m.name, mentions: 1 }))) ?? `${memberNames[0]}'s Family`;

    const { data: existing } = await supabaseAdmin
      .from('organizations')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .eq('type', 'family')
      .ilike('name', proposedName)
      .limit(1);

    if (existing?.[0]) {
      const orgId = existing[0].id as string;
      await this.linkMembersToOrg(userId, orgId, members.map((m) => m.id));
      return orgId;
    }

    try {
      const org = await organizationService.createOrganization(userId, {
        name: proposedName,
        type: 'family',
        description: `Inferred from: ${context.slice(0, 200)}`,
        metadata: {
          inferred: true,
          inference_source: 'kinship_graph',
          source_message_id: messageId,
          member_character_ids: members.map((m) => m.id),
          head_of_household: members[0]?.name,
        },
      });
      await this.linkMembersToOrg(userId, org.id, members.map((m) => m.id));
      return org.id;
    } catch (err) {
      logger.warn({ err, userId }, 'Family group auto-create failed');
      return undefined;
    }
  }

  private async linkMembersToOrg(userId: string, orgId: string, characterIds: string[]): Promise<void> {
    for (const characterId of characterIds) {
      await supabaseAdmin
        .from('character_organizations')
        .upsert(
          { user_id: userId, character_id: characterId, organization_id: orgId, role: 'member' },
          { onConflict: 'character_id,organization_id', ignoreDuplicates: true }
        )
        .catch(() => {});
    }
  }
}

export const familyGraphInferenceService = new FamilyGraphInferenceService();
