import { describe, expect, it } from 'vitest';
import { WORLD_RELATIONSHIP_TYPE_OPTIONS } from './CharacterLoreProfileSection';

describe('People in their world relationship types', () => {
  it('includes grandson and other kinship terms people actually use', () => {
    const values = WORLD_RELATIONSHIP_TYPE_OPTIONS.map((option) => option.value);
    expect(values).toEqual(expect.arrayContaining([
      'grandson',
      'granddaughter',
      'grandmother',
      'uncle',
      'aunt',
      'son',
      'daughter',
    ]));
  });

  it('labels undefined dating as seeing each other, not situationship', () => {
    const option = WORLD_RELATIONSHIP_TYPE_OPTIONS.find((entry) => entry.value === 'situationship');
    expect(option?.label).toBe('Seeing each other');
    expect(WORLD_RELATIONSHIP_TYPE_OPTIONS.some((entry) => entry.label === 'Situationship')).toBe(false);
  });
});
