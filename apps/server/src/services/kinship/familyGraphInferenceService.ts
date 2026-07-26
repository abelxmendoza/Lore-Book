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
  extractRelationalKinshipClaims,
  kinshipRoleToString,
  parseKinshipFromName,
  type KinshipRole,
} from './kinshipGlossary';
import { applyKinshipSexInference } from './applyKinshipSexInference';
import { familySurnameSuggestionService } from './familySurnameSuggestionService';
import { applyKinshipLabelToCharacter, upsertBidirectionalFamilyEdge } from './familyEdgeWriter';

type CharacterRow = { id: string; name: string; metadata?: Record<string, unknown> | null };

const PARENT_ROLES = new Set<KinshipRole>(['MOTHER', 'FATHER', 'STEPMOTHER', 'STEPFATHER']);
const PARENT_KINSHIP = new Set(['mother', 'father', 'stepmother', 'stepfather', 'mom', 'dad']);

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

    const kinMentions = [
      ...extractKinshipMentions(text),
      ...extractRelationalKinshipClaims(text),
    ];
    const kinCharacters: CharacterRow[] = [];
    const parentIds = new Set<string>();

    for (const kin of kinMentions) {
      const row = resolveCharacterByName(kin.sourcePhrase, charRows);
      if (!row) continue;
      kinCharacters.push(row);
      if (PARENT_ROLES.has(kin.role)) parentIds.add(row.id);

      void applyKinshipSexInference(userId, row.id, {
        role: kin.role,
        phrase: kin.sourcePhrase,
        kinship: kinshipRoleToString(kin.role),
      }).catch(() => {});

      if (protagonist && row.id !== protagonist.id) {
        const kinshipStr = kinshipRoleToString(kin.role);
        const created = await relationshipFoundationService.assertProtagonistKinship(
          userId,
          row.id,
          kinshipStr,
          messageId,
          kin.confidence
        );
        if (created) edges++;
        void applyKinshipLabelToCharacter(userId, row.id, kinshipStr).catch(() => {});
        // Re-check surnames even when the self↔kin edge already exists — cousins
        // who share a last name (and tree placement) still need linking.
        void familySurnameSuggestionService.checkForSurnameMatches(userId, row.id).catch(() => {});
      }
    }

    for (const charId of promotedCharacterIds) {
      const row = charRows.find((c) => c.id === charId);
      if (!row || !protagonist || row.id === protagonist.id) continue;
      const parsed = parseKinshipFromName(row.name);
      if (!parsed) continue;
      kinCharacters.push(row);
      if (PARENT_ROLES.has(parsed.role)) parentIds.add(row.id);
      void applyKinshipSexInference(userId, row.id, {
        role: parsed.role,
        phrase: parsed.sourcePhrase,
        kinship: kinshipRoleToString(parsed.role),
      }).catch(() => {});
      const parsedKinshipStr = kinshipRoleToString(parsed.role);
      const created = await relationshipFoundationService.assertProtagonistKinship(
        userId,
        row.id,
        parsedKinshipStr,
        messageId,
        parsed.confidence
      );
      if (created) edges++;
      void applyKinshipLabelToCharacter(userId, row.id, parsedKinshipStr).catch(() => {});
      void familySurnameSuggestionService.checkForSurnameMatches(userId, row.id).catch(() => {});
    }

    // Also pick up parents already linked to the protagonist (for spouse linking).
    if (protagonist) {
      const { data: parentEdges } = await supabaseAdmin
        .from('character_relationships')
        .select('source_character_id, target_character_id, metadata, relationship_type')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${protagonist.id},target_character_id.eq.${protagonist.id}`);
      for (const edge of parentEdges ?? []) {
        const kin = String((edge.metadata as Record<string, unknown> | null)?.kinship ?? '').toLowerCase();
        if (!PARENT_KINSHIP.has(kin) && !PARENT_KINSHIP.has(String(edge.relationship_type).toLowerCase())) continue;
        const otherId =
          edge.source_character_id === protagonist.id
            ? edge.target_character_id
            : edge.source_character_id;
        if (otherId) parentIds.add(otherId as string);
      }
    }

    if (parentIds.size >= 2) {
      const linked = await this.linkParentSpouses(userId, [...parentIds], messageId);
      edges += linked;
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

  /**
   * When both Mom and Dad (or step-parents) are known, link them as spouses.
   * Does not invent parents — only connects parents already in the graph.
   */
  private async linkParentSpouses(
    userId: string,
    parentIds: string[],
    messageId: string,
  ): Promise<number> {
    let created = 0;
    const unique = [...new Set(parentIds)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i];
        const b = unique[j];
        const { data: existing } = await supabaseAdmin
          .from('character_relationships')
          .select('id, relationship_type, status')
          .eq('user_id', userId)
          .or(
            `and(source_character_id.eq.${a},target_character_id.eq.${b}),and(source_character_id.eq.${b},target_character_id.eq.${a})`,
          )
          .limit(1)
          .maybeSingle();
        if (existing) {
          if (
            existing.status === 'active' &&
            (existing.relationship_type === 'spouse_of' ||
              existing.relationship_type === 'family' ||
              existing.relationship_type === 'romantic')
          ) {
            continue;
          }
          if (existing.relationship_type === 'possible_family') {
            await supabaseAdmin
              .from('character_relationships')
              .update({
                relationship_type: 'spouse_of',
                relationship_category: 'family',
                status: 'active',
                inference_status: 'inferred',
                summary: 'Inferred spouses — both are parents in your family tree',
                metadata: {
                  kinship: 'spouse',
                  inference_source: 'parent_pair_inference',
                  source_message_id: messageId,
                },
              })
              .eq('id', existing.id);
            // Ensure reverse spouse_of exists for bidirectional consistency.
            await upsertBidirectionalFamilyEdge(userId, a, b, 'spouse_of', {
              source: 'parent_pair_inference',
              inferenceStatus: 'inferred',
              summary: 'Inferred spouses — both are parents in your family tree',
              metadata: {
                kinship: 'spouse',
                inference_source: 'parent_pair_inference',
                source_message_id: messageId,
              },
            });
            created++;
          }
          continue;
        }

        const ok = await upsertBidirectionalFamilyEdge(userId, a, b, 'spouse_of', {
          source: 'parent_pair_inference',
          inferenceStatus: 'inferred',
          summary: 'Inferred spouses — both are parents in your family tree',
          metadata: {
            kinship: 'spouse',
            inference_source: 'parent_pair_inference',
            source_message_id: messageId,
          },
        });
        if (ok) created++;
      }
    }
    return created;
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
