/**
 * Derive a household (spouse, kids, pets) directly from the Family Tree
 * graph (`character_relationships`), so a family group's roster can be
 * populated from what's actually known about a person instead of only
 * whoever was literally named in one chat message.
 *
 * Intentionally one-hop and separate from the multi-hop tree walker in
 * familyTreeService.ts — a household is shallow by definition.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeFamilyEdgeType } from './familyEdgeWriter';

export type HouseholdMemberRole = 'spouse' | 'child' | 'pet';

export type HouseholdMember = {
  characterId: string;
  name: string;
  role: HouseholdMemberRole;
  species?: string | null;
  /** The anchor this member was derived through (the household owner, or their spouse). */
  viaAnchorId: string;
};

type RelationshipRow = {
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
};

type CharacterRow = {
  id: string;
  name: string;
  species: string | null;
};

const SPOUSE_TYPE = normalizeFamilyEdgeType('spouse');
const CHILD_TYPE = normalizeFamilyEdgeType('parent'); // source parent_of target => target is the child
const OWNER_TYPE = normalizeFamilyEdgeType('owner'); // source owner_of target => target is the pet

/**
 * Derive household members for one or more anchor characters. For each
 * anchor: their spouse, the anchor's (and their spouse's) children, and any
 * pets owned by the anchor or their spouse. Pure read, no writes; returns an
 * empty list rather than fabricating anything when the tree has no data.
 */
export async function deriveHouseholdMembers(
  userId: string,
  anchorCharacterIds: string[],
): Promise<HouseholdMember[]> {
  const anchors = [...new Set(anchorCharacterIds.filter(Boolean))];
  if (anchors.length === 0) return [];

  try {
    const { data: outgoing, error } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type')
      .eq('user_id', userId)
      .in('source_character_id', anchors)
      .in('relationship_type', [SPOUSE_TYPE, CHILD_TYPE, OWNER_TYPE]);
    if (error) throw error;

    const rows = (outgoing ?? []) as RelationshipRow[];
    const spouseIds = new Set(
      rows.filter((r) => r.relationship_type === SPOUSE_TYPE).map((r) => r.target_character_id),
    );

    // Children of a spouse count too (step-kids), so re-query using spouses as
    // additional anchors for the child/owner edge types only.
    let spouseSourced: RelationshipRow[] = [];
    if (spouseIds.size > 0) {
      const { data: viaSpouse, error: spouseErr } = await supabaseAdmin
        .from('character_relationships')
        .select('source_character_id, target_character_id, relationship_type')
        .eq('user_id', userId)
        .in('source_character_id', [...spouseIds])
        .in('relationship_type', [CHILD_TYPE, OWNER_TYPE]);
      if (spouseErr) throw spouseErr;
      spouseSourced = (viaSpouse ?? []) as RelationshipRow[];
    }

    const allRows = [...rows, ...spouseSourced];

    const byRole = new Map<string, { role: HouseholdMemberRole; viaAnchorId: string }>();
    for (const row of allRows) {
      if (anchors.includes(row.target_character_id)) continue; // never re-add an anchor as its own member
      if (row.relationship_type === SPOUSE_TYPE) {
        if (!byRole.has(row.target_character_id)) {
          byRole.set(row.target_character_id, { role: 'spouse', viaAnchorId: row.source_character_id });
        }
      } else if (row.relationship_type === CHILD_TYPE) {
        if (!byRole.has(row.target_character_id) || byRole.get(row.target_character_id)?.role !== 'spouse') {
          byRole.set(row.target_character_id, { role: 'child', viaAnchorId: row.source_character_id });
        }
      } else if (row.relationship_type === OWNER_TYPE) {
        if (!byRole.has(row.target_character_id)) {
          byRole.set(row.target_character_id, { role: 'pet', viaAnchorId: row.source_character_id });
        }
      }
    }

    if (byRole.size === 0) return [];

    const { data: characters, error: charErr } = await supabaseAdmin
      .from('characters')
      .select('id, name, species')
      .eq('user_id', userId)
      .in('id', [...byRole.keys()]);
    if (charErr) throw charErr;

    const characterById = new Map(((characters ?? []) as CharacterRow[]).map((c) => [c.id, c]));

    const members: HouseholdMember[] = [];
    for (const [characterId, info] of byRole) {
      const character = characterById.get(characterId);
      if (!character) continue; // don't fabricate a member for a dangling edge
      members.push({
        characterId,
        name: character.name,
        role: info.role,
        species: character.species,
        viaAnchorId: info.viaAnchorId,
      });
    }
    return members;
  } catch (err) {
    logger.debug({ err, userId, anchorCharacterIds }, 'deriveHouseholdMembers failed (non-fatal)');
    return [];
  }
}
