import { describe, expect, it } from 'vitest';
import { extractResponseActions } from './responseActionExtractor';

describe('extractResponseActions', () => {
  it('extracts a create_group suggestion', () => {
    const actions = extractResponseActions('Should I create a School Band group for you?');
    expect(actions.some((a) => a.type === 'create_group' && a.payload?.groupName === 'School Band')).toBe(true);
  });

  it('extracts an add_relationship suggestion', () => {
    const actions = extractResponseActions('Would you like to add Bryan as your best friend?');
    expect(actions.some((a) => a.type === 'add_relationship' && a.payload?.characterName === 'Bryan')).toBe(true);
  });

  it('extracts a delete_family_member candidate from the confirmation phrasing', () => {
    const actions = extractResponseActions(
      "Delete **Ralph Mendoza** from your family tree? This permanently removes the character and everything tied to it, and can't be undone.",
    );
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'delete_family_member',
        label: 'Delete Ralph Mendoza',
        payload: { characterName: 'Ralph Mendoza' },
      }),
    ]);
  });

  it('does not extract a delete_family_member candidate from unrelated text', () => {
    const actions = extractResponseActions('Ralph Mendoza is your uncle on your paternal side.');
    expect(actions.some((a) => a.type === 'delete_family_member')).toBe(false);
  });

  it('extracts a delete_household candidate from the confirmation phrasing', () => {
    const actions = extractResponseActions(
      "Delete the **Mom and Dad's House** household? This removes it from your household list and can't be undone.",
    );
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'delete_household',
        label: "Delete Mom and Dad's House household",
        payload: { householdName: "Mom and Dad's House" },
      }),
    ]);
  });

  it('does not extract a delete_household candidate from unrelated text', () => {
    const actions = extractResponseActions("Ralph lives at Mom and Dad's House.");
    expect(actions.some((a) => a.type === 'delete_household')).toBe(false);
  });

  it('returns no actions for plain narrative text', () => {
    expect(extractResponseActions('It was a quiet afternoon at the lake house.')).toEqual([]);
  });
});
