import { describe, expect, it } from 'vitest';

import { buildFamilyTreeClipboardText } from './familyTreeClipboard';
import type { FamilyMember, FamilyTree } from '../types/socialRoles';

function member(partial: Partial<FamilyMember> & Pick<FamilyMember, 'id' | 'name' | 'relation' | 'generation'>): FamilyMember {
  return {
    relation_label: partial.relation_label ?? partial.relation,
    ...partial,
  };
}

describe('buildFamilyTreeClipboardText', () => {
  it('exports empty trees clearly', () => {
    const text = buildFamilyTreeClipboardText({ members: [], branches: [], self_id: '' }, { title: 'Family' });
    expect(text).toContain('Family (0 members)');
    expect(text).toContain('(empty)');
  });

  it('includes relationship details plus parents and children', () => {
    const tree: FamilyTree = {
      self_id: 'you',
      branches: [{ side: 'maternal', label: "Mother's side", color: '#f0f' }],
      members: [
        member({
          id: 'you',
          name: 'You',
          relation: 'related',
          relation_label: 'You',
          generation: 0,
          is_self: true,
        }),
        member({
          id: 'mom',
          name: 'Jamie',
          kinship_title: 'Mom',
          relation: 'parent',
          relation_label: 'Mom',
          generation: -1,
          side: 'maternal',
          inference_status: 'asserted',
          has_card: true,
        }),
        member({
          id: 'kid',
          name: 'Taylor',
          relation: 'child',
          relation_label: 'Child',
          generation: 1,
          parent_id: 'you',
          notes: 'Lives nearby',
        }),
        member({
          id: 'sib',
          name: 'Alex',
          relation: 'sibling',
          relation_label: 'Sibling',
          generation: 0,
        }),
      ],
    };

    const text = buildFamilyTreeClipboardText(tree, {
      title: 'Family tree — You',
      filters: ['scope=mine'],
    });

    expect(text).toContain('Family tree — You (4 members)');
    expect(text).toContain('Filters: scope=mine');
    expect(text).toContain('Jamie (“Mom”)');
    expect(text).toContain('Relation: parent');
    expect(text).toContain('Relation label: Mom');
    expect(text).toContain('Side: maternal');
    expect(text).toContain('Parents:');
    expect(text).toContain('Children:');
    expect(text).toContain('Taylor');
    expect(text).toContain('Explicit parent id: you');
    expect(text).toContain('Notes: Lives nearby');
    expect(text).toContain('--- Parent → child links ---');
    expect(text).toMatch(/Jamie.*→.*You|You.*→.*Taylor/s);
  });
});
