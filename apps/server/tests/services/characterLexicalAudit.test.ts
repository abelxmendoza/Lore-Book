import { describe, it, expect } from 'vitest';
import { classifyEntity } from '../../src/services/entities/entityClassifier';
import {
  isCollectivePersonName,
  isRoleDescriptorPersonName,
} from '../../src/utils/personNameValidation';

describe('character lexical rules', () => {
  it('rejects products and places as characters', () => {
    expect(classifyEntity('Find My').type).not.toBe('PERSON');
    expect(classifyEntity('Moreno Valley').type).toMatch(/PLACE|LOCATION/);
    expect(classifyEntity('Amazon Ring').type).toMatch(/PRODUCT|BRAND/);
  });

  it('flags collective labels', () => {
    expect(isCollectivePersonName('Amazon Engineers')).toBe(true);
    expect(isCollectivePersonName('Tía Grace')).toBe(false);
  });

  it('flags role descriptors', () => {
    expect(isRoleDescriptorPersonName("DJ for Moth Queen's Show")).toBe(true);
  });
});
