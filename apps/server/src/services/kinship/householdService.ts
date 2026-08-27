/**
 * Household read model — residents, visitors, head of household.
 *
 * Roster rows can outlive a family-tree exclude (the user kept the Character
 * card but said "not family"). The directory only shows people who are still
 * listed on the family tree.
 */
import { supabaseAdmin } from '../supabaseClient';
import { organizationService } from '../organizationService';
import { familyTreeService, isFamilyExcluded, isSyntheticNodeId } from '../familyTreeService';
import { parseKinshipFromName } from './kinshipGlossary';

export type HouseholdRole = 'resident' | 'former_resident' | 'visitor' | 'head_of_household';

export type HouseholdMember = {
  characterId: string;
  name: string;
  householdRole: HouseholdRole;
  kinshipLabel?: string;
  confidence: number;
};

export type HouseholdDTO = {
  id: string;
  name: string;
  locationName?: string;
  headOfHousehold?: string;
  headCharacterId?: string;
  members: HouseholdMember[];
  residents: HouseholdMember[];
  visitors: HouseholdMember[];
  residentCount: number;
  confidence: number;
  sourceMessageId?: string;
};

export function isHouseholdOrg(name: string, metadata: Record<string, unknown>): boolean {
  if (metadata.household_deleted) return false;
  return (
    metadata.inference_source === 'household_residence' ||
    /household|house|home|apartment|condo|casa/i.test(name)
  );
}

/** Active roster rows must still be listed family — not tree-excluded, not Character-only. */
export function isListedFamilyMember(
  characterId: string,
  familyMemberIds: Set<string> | null,
  metadata?: Record<string, unknown> | null,
): boolean {
  if (!characterId || isSyntheticNodeId(characterId) || characterId.startsWith('head-')) return false;
  if (isFamilyExcluded(metadata)) return false;
  if (familyMemberIds) return familyMemberIds.has(characterId);
  // No tree snapshot supplied — still hide explicit tree-excludes.
  return true;
}

export class HouseholdService {
  async listHouseholds(
    userId: string,
    opts?: { familyMemberIds?: Iterable<string> },
  ): Promise<HouseholdDTO[]> {
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name, metadata, description')
      .eq('user_id', userId)
      .eq('type', 'family');

    const householdOrgs = (orgs ?? []).filter((org) =>
      isHouseholdOrg(org.name as string, (org.metadata ?? {}) as Record<string, unknown>),
    );
    if (householdOrgs.length === 0) return [];

    const familyMemberIds = opts?.familyMemberIds
      ? new Set([...opts.familyMemberIds].filter(Boolean))
      : await this.loadFamilyMemberIds(userId);

    const membersByOrg = await organizationService.getMembersForOrganizations(
      householdOrgs.map((org) => org.id as string),
    );

    const rosterIds = new Set<string>();
    for (const members of membersByOrg.values()) {
      for (const m of members) {
        if (m.character_id) rosterIds.add(m.character_id);
      }
    }

    const metadataById = new Map<string, Record<string, unknown> | null>();
    if (rosterIds.size > 0) {
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, metadata')
        .eq('user_id', userId)
        .in('id', [...rosterIds]);
      for (const row of characters ?? []) {
        metadataById.set(row.id as string, (row.metadata ?? null) as Record<string, unknown> | null);
      }
    }

    const households: HouseholdDTO[] = [];

    for (const org of householdOrgs) {
      const meta = (org.metadata ?? {}) as Record<string, unknown>;
      const members = membersByOrg.get(org.id as string) ?? [];

      const headName = (meta.head_of_household as string | undefined)?.trim();
      let headCharacterId: string | undefined;

      const memberDtos: HouseholdMember[] = [];
      for (const m of members) {
        if (!m.character_id) continue;
        if (m.status === 'former' || /former/.test((m.role ?? '').toLowerCase())) continue;
        if (!isListedFamilyMember(m.character_id, familyMemberIds, metadataById.get(m.character_id))) {
          continue;
        }

        const roleRaw = (m.role ?? 'member').toLowerCase();
        let householdRole: HouseholdRole = roleRaw === 'visitor' ? 'visitor' : 'resident';

        const parsed = parseKinshipFromName(m.character_name);
        const isHead =
          headName &&
          m.character_name.toLowerCase().includes(headName.toLowerCase().split(/\s+/)[0]);

        if (isHead || householdRole === 'head_of_household') {
          householdRole = 'head_of_household';
          headCharacterId = m.character_id;
        }

        memberDtos.push({
          characterId: m.character_id,
          name: m.character_name,
          householdRole,
          kinshipLabel: parsed?.canonicalLabel,
          confidence: Number(meta.confidence ?? 0.85),
        });
      }

      const residents = memberDtos.filter((m) => m.householdRole === 'resident' || m.householdRole === 'head_of_household');
      const visitors = memberDtos.filter((m) => m.householdRole === 'visitor');
      const listedHead = headCharacterId
        ? memberDtos.find((m) => m.characterId === headCharacterId)?.name
        : undefined;

      households.push({
        id: org.id as string,
        name: org.name as string,
        locationName: (meta.residence_name as string | undefined) ?? org.name,
        headOfHousehold: listedHead,
        headCharacterId,
        members: memberDtos,
        residents,
        visitors,
        residentCount: residents.length,
        confidence: Number(meta.confidence ?? 0.85),
        sourceMessageId: meta.source_message_id as string | undefined,
      });
    }

    return households.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  }

  private async loadFamilyMemberIds(userId: string): Promise<Set<string> | null> {
    try {
      const tree = await familyTreeService.getUserFamilyTree(userId);
      return new Set((tree.members ?? []).map((m) => m.id).filter(Boolean));
    } catch {
      return null;
    }
  }
}

export const householdService = new HouseholdService();
