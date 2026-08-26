import type { FamilyTree } from '../types/socialRoles';
import { formatFamilyMemberDisplayName } from './familyMemberDisplay';
import { buildListClipboardText } from './listClipboard';

export type CharacterClipboardPerson = {
  name: string;
  relationshipType?: string;
  status?: string;
  closenessScore?: number;
  summary?: string;
  section?: string;
};

export type CharacterClipboardPeripheral = {
  name?: string | null;
  surface?: string | null;
  role?: string | null;
  tier?: string | null;
  summary?: string | null;
};

export type CharacterClipboardGroup = {
  name: string;
  groupType?: string;
  membership?: string;
  role?: string;
};

/** Family-tree relatives shown on Connections, excluding the card's own self node. */
export function peopleFromFamilyTree(
  tree: FamilyTree | null | undefined,
): CharacterClipboardPerson[] {
  return (tree?.members ?? [])
    .filter((member) => !member.is_self && !member.is_placeholder)
    .map((member) => ({
      name: formatFamilyMemberDisplayName(member),
      relationshipType: member.relation_label || member.relation,
      status: member.deceased ? 'deceased' : member.inference_status,
      closenessScore: member.closeness,
      summary: member.notes,
      section: 'Family tree',
    }))
    .filter((person) => person.name.trim().length > 0);
}

/** Wider-network / inferred people shown on Connections. */
export function peopleFromPeripherals(
  items: CharacterClipboardPeripheral[] | null | undefined,
): CharacterClipboardPerson[] {
  return (items ?? [])
    .map((item) => ({
      name: (item.name || item.surface || '').trim(),
      relationshipType: item.role ?? undefined,
      status: item.tier ?? undefined,
      summary: item.summary ?? undefined,
      section: 'Wider network',
    }))
    .filter((person) => person.name.length > 0);
}

export function buildCharacterConnectionsClipboardText(input: {
  characterName: string;
  withYou?: string | null;
  romance?: { type: string; status?: string } | null;
  people: CharacterClipboardPerson[];
  groups?: CharacterClipboardGroup[];
  associated?: string[];
}): string {
  const parts: string[] = [`Connections — ${input.characterName.trim() || 'Character'}`];

  if (input.withYou?.trim()) {
    parts.push(`With you: ${input.withYou.trim()}`);
  }
  if (input.romance?.type?.trim()) {
    const status = input.romance.status?.trim();
    parts.push(
      `Dating & Romance: ${input.romance.type.trim()}${status ? ` (${status})` : ''}`,
    );
  }

  parts.push(
    buildListClipboardText({
      title: 'People',
      items: input.people.map((person) => ({
        heading: person.name,
        fields: [
          { label: 'Section', value: person.section },
          { label: 'Type', value: person.relationshipType?.replace(/_/g, ' ') },
          { label: 'Status', value: person.status?.replace(/_/g, ' ') },
          { label: 'Closeness', value: person.closenessScore },
        ],
        body: person.summary,
      })),
    }),
  );

  if ((input.groups ?? []).length > 0) {
    parts.push(
      buildListClipboardText({
        title: 'Groups',
        items: (input.groups ?? []).map((group) => ({
          heading: group.name,
          fields: [
            { label: 'Kind', value: group.groupType?.replace(/_/g, ' ') },
            { label: 'Membership', value: group.membership },
            { label: 'Role', value: group.role?.replace(/_/g, ' ') },
          ],
        })),
      }),
    );
  }

  const associated = (input.associated ?? []).map((name) => name.trim()).filter(Boolean);
  if (associated.length > 0) {
    parts.push(`Associated with:\n${associated.map((name) => `- ${name}`).join('\n')}`);
  }

  return parts.filter(Boolean).join('\n\n');
}
