import { buildListClipboardText } from './listClipboard';

export type HouseholdClipboardMember = {
  name: string;
  kinshipLabel?: string;
  householdRole?: string;
};

export type HouseholdClipboardItem = {
  name: string;
  locationName?: string;
  headOfHousehold?: string;
  residents: HouseholdClipboardMember[];
  visitors: HouseholdClipboardMember[];
  residentCount: number;
};

function formatMember(member: HouseholdClipboardMember): string {
  const kin = member.kinshipLabel?.trim();
  return kin ? `${member.name} (${kin})` : member.name;
}

export function buildHouseholdClipboardText(
  households: HouseholdClipboardItem[],
  options?: { title?: string; filters?: string[] },
): string {
  return buildListClipboardText({
    title: options?.title?.trim() || 'Households',
    filters: options?.filters,
    items: households.map((h) => ({
      heading: h.locationName?.trim() || h.name,
      fields: [
        { label: 'Household', value: h.name },
        { label: 'Location', value: h.locationName },
        { label: 'Head', value: h.headOfHousehold },
        { label: 'Residents', value: h.residents.map(formatMember) },
        { label: 'Visitors', value: h.visitors.map(formatMember) },
        { label: 'Resident count', value: h.residentCount },
      ],
    })),
  });
}
