import type { Organization } from '../components/organizations/OrganizationProfileCard';

const now = new Date().toISOString();

function household(
  id: string,
  name: string,
  members: Array<{ name: string; role: string }>,
  extras: Partial<Organization> = {},
): Organization & { user_is_member: boolean; character_role?: string } {
  const youAreIn = members.some((member) => /^you$/i.test(member.name));
  const self = members.find((member) => /^you$/i.test(member.name));
  return {
    id,
    name,
    aliases: [],
    type: 'other',
    group_type: 'household',
    membership_model: 'strict',
    user_relationship: youAreIn ? 'member' : 'aware_of',
    is_public_entity: false,
    description: extras.description,
    location: extras.location,
    status: 'active',
    member_count: members.length,
    usage_count: 6,
    confidence: 0.92,
    last_seen: now,
    created_at: now,
    updated_at: now,
    user_is_member: youAreIn,
    character_role: self?.role,
    members: members.map((member, index) => ({
      id: `${id}-m${index}`,
      character_name: member.name,
      role: member.role,
      status: 'active' as const,
    })),
    ...extras,
  };
}

/** Demo homes used on character modals — people can belong to more than one. */
export const DEMO_CHARACTER_HOUSEHOLDS: Array<
  Organization & { user_is_member: boolean; character_role?: string }
> = [
  household(
    'demo-hh-morgan',
    'Morgan Household',
    [
      { name: 'You', role: 'lives here' },
      { name: 'Elena Morgan', role: 'head of household' },
      { name: 'Mia Morgan', role: 'lives here' },
      { name: 'Noor Vance', role: 'lives here' },
      { name: 'Theo Whitfield', role: 'weekends' },
      { name: 'Waffles', role: 'lives here' },
    ],
    { location: 'Home', description: 'The house you keep — Mia and Noor live here; Theo stays on weekends.' },
  ),
  household(
    'demo-hh-dana',
    "Dana's House",
    [
      { name: 'Dana Whitfield', role: 'head of household' },
      { name: 'Theo Whitfield', role: 'lives here' },
    ],
    {
      location: 'Dana’s place',
      description: "Theo's other home with his mom after the split.",
    },
  ),
  household(
    'demo-hh-ray',
    "Ray's Place",
    [
      { name: 'Ray Morgan', role: 'head of household' },
      { name: 'Elena Morgan', role: 'visits' },
    ],
    { location: 'Dad’s apartment', description: 'Ray’s apartment — Elena still drops by.' },
  ),
  household(
    'demo-hh-elena-cedar',
    "Nana Elena's Household",
    [
      { name: 'Nana Elena', role: 'head of household' },
      { name: 'Elena Morgan', role: 'visits' },
    ],
    { location: 'Cedar Falls, CA', description: 'Sunday calls and holiday dinners.' },
  ),
];

export function demoHouseholdsForCharacter(
  characterName: string,
): Array<Organization & { user_is_member: boolean; character_role?: string }> {
  const needle = characterName.trim().toLowerCase();
  const isSelf = needle === 'you' || needle === 'alex morgan';
  return DEMO_CHARACTER_HOUSEHOLDS.filter((org) =>
    (org.members ?? []).some((member) => {
      const name = member.character_name.trim().toLowerCase();
      return name === needle || (isSelf && name === 'you');
    }),
  ).map((org) => {
    const seat = (org.members ?? []).find((member) => {
      const name = member.character_name.trim().toLowerCase();
      return name === needle || (isSelf && name === 'you');
    });
    return { ...org, character_role: seat?.role };
  });
}
