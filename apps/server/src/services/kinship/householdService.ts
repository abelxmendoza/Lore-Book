/**
 * Household read model — residents, visitors, head of household.
 */
import { supabaseAdmin } from '../supabaseClient';
import { organizationService } from '../organizationService';
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

function isHouseholdOrg(
  name: string,
  metadata: Record<string, unknown>,
  groupType?: string | null,
  type?: string | null,
): boolean {
  if (metadata.household_deleted) return false;
  if (groupType === 'household' || type === 'household') return true;
  return (
    metadata.inference_source === 'household_residence' ||
    /household|house|home|apartment|condo|casa/i.test(name)
  );
}

export class HouseholdService {
  async listHouseholds(userId: string): Promise<HouseholdDTO[]> {
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name, metadata, description, group_type, type')
      .eq('user_id', userId)
      .or('group_type.eq.household,type.eq.family,type.eq.household');

    const householdOrgs = (orgs ?? []).filter((org) =>
      isHouseholdOrg(
        org.name as string,
        (org.metadata ?? {}) as Record<string, unknown>,
        org.group_type as string | null,
        org.type as string | null,
      ),
    );
    if (householdOrgs.length === 0) return [];

    const membersByOrg = await organizationService.getMembersForOrganizations(
      householdOrgs.map((org) => org.id as string),
    );

    const households: HouseholdDTO[] = [];

    for (const org of householdOrgs) {
      const meta = (org.metadata ?? {}) as Record<string, unknown>;
      const members = membersByOrg.get(org.id as string) ?? [];

      const headName = (meta.head_of_household as string | undefined)?.trim();
      let headCharacterId: string | undefined;

      const memberDtos: HouseholdMember[] = [];
      for (const m of members) {
        if (!m.character_id) continue;
        const roleRaw = (m.role ?? 'member').toLowerCase().replace(/_/g, ' ');
        let householdRole: HouseholdRole =
          m.status === 'former' || /former/.test(roleRaw)
            ? 'former_resident'
            : /visit|guest/.test(roleRaw)
              ? 'visitor'
              : /head of household|^head$|elder/.test(roleRaw)
                ? 'head_of_household'
                : 'resident';

        const parsed = parseKinshipFromName(m.character_name);
        const isHead =
          headName &&
          m.character_name.toLowerCase().includes(headName.toLowerCase().split(/\s+/)[0]);

        if (householdRole !== 'former_resident' && (isHead || householdRole === 'head_of_household')) {
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

      // Head not in roster — synthesize from metadata
      if (headName && !headCharacterId) {
        memberDtos.unshift({
          characterId: `head-${org.id}`,
          name: headName,
          householdRole: 'head_of_household',
          kinshipLabel: parseKinshipFromName(headName)?.canonicalLabel,
          confidence: 0.92,
        });
      }

      const residents = memberDtos.filter((m) => m.householdRole === 'resident' || m.householdRole === 'head_of_household');
      const visitors = memberDtos.filter((m) => m.householdRole === 'visitor');

      households.push({
        id: org.id as string,
        name: org.name as string,
        locationName: (meta.residence_name as string | undefined) ?? org.name,
        headOfHousehold: headName ?? residents.find((r) => r.householdRole === 'head_of_household')?.name,
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
}

export const householdService = new HouseholdService();
