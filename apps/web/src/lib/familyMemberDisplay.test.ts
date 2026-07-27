import { describe, expect, it } from 'vitest';
import {
  formatFamilyMemberDisplayName,
  formatFamilyMemberSubtitle,
  resolveLegalPersonName,
  resolveParentCallName,
} from './familyMemberDisplay';

describe('formatFamilyMemberDisplayName', () => {
  it('formats Mom/Dad with legal name in parentheses', () => {
    expect(
      formatFamilyMemberDisplayName({
        name: 'Elena Chen-Whitmore',
        kinship_title: 'Mom',
        relation_label: 'Mom',
        relation: 'parent',
      }),
    ).toBe('Mom (Elena Chen-Whitmore)');

    expect(
      formatFamilyMemberDisplayName({
        name: 'Roberto Whitmore',
        relation_label: 'Dad',
        relation: 'parent',
      }),
    ).toBe('Dad (Roberto Whitmore)');
  });

  it('uses first+last when the card name is only Mom/Dad', () => {
    expect(
      formatFamilyMemberDisplayName({
        name: 'Mom',
        first_name: 'Elena',
        last_name: 'Chen',
        kinship_title: 'Mother',
      }),
    ).toBe('Mom (Elena Chen)');
  });

  it('strips a leading Mom/Dad token from the stored name', () => {
    expect(
      formatFamilyMemberDisplayName({
        name: 'Dad Roberto Whitmore',
        relation_label: 'Dad',
      }),
    ).toBe('Dad (Roberto Whitmore)');
  });

  it('leaves non-parent kin unchanged', () => {
    expect(
      formatFamilyMemberDisplayName({
        name: 'Tía Grace',
        kinship_title: 'Aunt',
        relation_label: 'Aunt',
      }),
    ).toBe('Tía Grace');
  });

  it('resolves call name and legal name helpers', () => {
    expect(resolveParentCallName({ name: 'Elena', relation_label: 'Mother' })).toBe('Mom');
    expect(
      resolveLegalPersonName({ name: 'Mom', first_name: 'Elena', last_name: 'Chen' }, 'Mom'),
    ).toBe('Elena Chen');
  });

  it('omits redundant subtitle when primary already has Mom (Name)', () => {
    expect(
      formatFamilyMemberSubtitle({
        name: 'Elena Chen',
        relation_label: 'Mom',
        kinship_title: 'Mom',
      }),
    ).toBeNull();
  });
});
