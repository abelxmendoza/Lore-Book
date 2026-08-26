import { buildListClipboardText } from './listClipboard';

export type OrganizationClipboardLink = {
  fromName: string;
  toName: string;
  relationshipType: string;
  notes?: string;
  inferred?: boolean;
};

export function buildOrganizationRelationshipsClipboardText(input: {
  groupName: string;
  parent?: string | null;
  subgroups?: string[];
  links: OrganizationClipboardLink[];
}): string {
  const parts: string[] = [`Relationships — ${input.groupName.trim() || 'Group'}`];

  if (input.parent?.trim()) {
    parts.push(`Part of: ${input.parent.trim()}`);
  }
  const subgroups = (input.subgroups ?? []).map((name) => name.trim()).filter(Boolean);
  if (subgroups.length > 0) {
    parts.push(`Subgroups:\n${subgroups.map((name) => `- ${name}`).join('\n')}`);
  }

  parts.push(
    buildListClipboardText({
      title: 'Group links',
      items: input.links.map((link) => ({
        heading: `${link.fromName} → ${link.toName}`,
        fields: [
          { label: 'Type', value: link.relationshipType.replace(/_/g, ' ') },
          { label: 'Learned from chat', value: link.inferred ? 'yes' : null },
        ],
        body: link.notes,
      })),
    }),
  );

  return parts.filter(Boolean).join('\n\n');
}
