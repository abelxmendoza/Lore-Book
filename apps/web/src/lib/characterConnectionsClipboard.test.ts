import { describe, expect, it } from 'vitest';

import {
  buildCharacterConnectionsClipboardText,
  peopleFromFamilyTree,
  peopleFromPeripherals,
} from './characterConnectionsClipboard';
import type { FamilyTree } from '../types/socialRoles';

describe('buildCharacterConnectionsClipboardText', () => {
  it('copies people, groups, and the with-you link', () => {
    const text = buildCharacterConnectionsClipboardText({
      characterName: 'Jamie',
      withYou: 'Friend',
      romance: { type: 'girlfriend', status: 'current' },
      people: [
        {
          name: 'Marcus',
          relationshipType: 'friend',
          status: 'active',
          closenessScore: 8,
          summary: 'Music scene',
          section: 'Friends & other',
        },
      ],
      groups: [
        {
          name: 'Northwind Logistics',
          groupType: 'company',
          membership: 'Shared',
          role: 'coworker',
        },
      ],
      associated: ['Taylor'],
    });

    expect(text).toContain('Connections — Jamie');
    expect(text).toContain('With you: Friend');
    expect(text).toContain('Dating & Romance: girlfriend (current)');
    expect(text).toContain('People (1 item)');
    expect(text).toContain('1. Marcus');
    expect(text).toContain('Type: friend');
    expect(text).toContain('Music scene');
    expect(text).toContain('1. Northwind Logistics');
    expect(text).toContain('Membership: Shared');
    expect(text).toContain('- Taylor');
  });

  it('maps family-tree relatives and wider-network people into the people list', () => {
    const tree: FamilyTree = {
      self_id: 'jamie-1',
      branches: [],
      members: [
        {
          id: 'jamie-1',
          name: 'Jamie',
          relation: 'related',
          relation_label: 'Self',
          generation: 0,
          is_self: true,
        },
        {
          id: 'mom-1',
          name: 'Elena Chen',
          kinship_title: 'Mom',
          relation: 'parent',
          relation_label: 'Mom',
          generation: -1,
        },
        {
          id: 'placeholder',
          name: 'Unknown cousin',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          is_placeholder: true,
        },
      ],
    };

    const people = [
      ...peopleFromFamilyTree(tree),
      ...peopleFromPeripherals([
        { name: 'Carmen', role: 'extended_family', tier: 'confirmed', summary: 'Met at brunch' },
      ]),
    ];
    const text = buildCharacterConnectionsClipboardText({
      characterName: 'Jamie',
      people,
    });

    expect(text).toContain('Mom (Elena Chen)');
    expect(text).toContain('Section: Family tree');
    expect(text).not.toContain('Unknown cousin');
    expect(text).not.toMatch(/1\. Jamie\b/);
    expect(text).toContain('Carmen');
    expect(text).toContain('Section: Wider network');
  });

  it('still copies an empty people list so the control always has a payload', () => {
    const text = buildCharacterConnectionsClipboardText({
      characterName: 'Jamie',
      people: [],
    });
    expect(text).toContain('Connections — Jamie');
    expect(text).toContain('People (0 items)');
    expect(text).toContain('(empty)');
  });
});
