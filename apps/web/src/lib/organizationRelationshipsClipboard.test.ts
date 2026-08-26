import { describe, expect, it } from 'vitest';

import { buildOrganizationRelationshipsClipboardText } from './organizationRelationshipsClipboard';

describe('buildOrganizationRelationshipsClipboardText', () => {
  it('copies hierarchy and group-to-group links', () => {
    const text = buildOrganizationRelationshipsClipboardText({
      groupName: "Jamie's Family",
      parent: null,
      subgroups: ["Jamie's Household"],
      links: [
        {
          fromName: "Jamie's Household",
          toName: "Jamie's Family",
          relationshipType: 'part_of',
          notes: 'Sunday dinners',
          inferred: true,
        },
      ],
    });

    expect(text).toContain("Relationships — Jamie's Family");
    expect(text).toContain("- Jamie's Household");
    expect(text).toContain("Jamie's Household → Jamie's Family");
    expect(text).toContain('Type: part of');
    expect(text).toContain('Learned from chat: yes');
    expect(text).toContain('Sunday dinners');
  });

  it('still copies when there are no links yet', () => {
    const text = buildOrganizationRelationshipsClipboardText({
      groupName: "Jamie's Family",
      links: [],
    });
    expect(text).toContain("Relationships — Jamie's Family");
    expect(text).toContain('Group links (0 items)');
    expect(text).toContain('(empty)');
  });
});
