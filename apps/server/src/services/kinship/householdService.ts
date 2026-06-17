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

function isHouseholdOrg(name: string, metadata: Record<string, unknown>): boolean {
  return (
    metadata.inference_source === 'household_residence' ||
    /household|house|home|apartment|condo|casa/i.test(name)
  );
}

export class HouseholdService {
  async listHouseholds(userId: string): Promise<HouseholdDTO[]> {
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name, metadata, description')
      .eq('user_id', userId)
      .eq('type', 'family');

    const households: HouseholdDTO[] = [];

    for (const org of orgs ?? []) {
      const meta = (org.metadata ?? {}) as Record<string, unknown>;
      if (!isHouseholdOrg(org.name as string, meta)) continue;

      const members = await organizationService.getMembers(org.id as string);
      const selfId = await this.findSelfId(userId);

      const headName = (meta.head_of_household as string | undefined)?.trim();
      let headCharacterId: string | undefined;

      const memberDtos: HouseholdMember[] = [];
      for (const m of members) {
        if (!m.character_id) continue;
        const roleRaw = (m.role ?? 'member').toLowerCase();
        let householdRole: HouseholdRole =
          roleRaw === 'visitor' ? 'visitor' : roleRaw === 'former' ? 'former_resident' : 'resident';

        const parsed = parseKinshipFromName(m.character_name);
        const isHead =
          headName &&
          m.character_name.toLowerCase().includes(headName.toLowerCase().split(/\s+/)[0]);

        if (isHead || householdRole === 'head_of_household') {
          householdRole = 'head_of_household';
          headCharacterId = m.character_id;
        } else if (selfId && m.character_id === selfId) {
          householdRole = 'visitor';
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

  private async findSelfId(userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, metadata, importance_level')
      .eq('user_id', userId)
      .limit(50);
    const self = (data ?? []).find(
      (c) =>
        (c.metadata as Record<string, unknown>)?.is_self === true ||
        c.importance_level === 'protagonist'
    );
    return (self?.id as string) ?? null;
  }
}

export const householdService = new HouseholdService();
