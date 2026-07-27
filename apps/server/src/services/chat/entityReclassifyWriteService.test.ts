/**
 * Entity reclassify chat write — parse wrong-book corrections.
 */
import { describe, expect, it } from 'vitest';
import { parseEntityReclassifyRequest } from './entityReclassifyWriteService';

describe('parseEntityReclassifyRequest', () => {
  it('parses "X is a group, not a place"', () => {
    expect(parseEntityReclassifyRequest('Northwind Collective is a group, not a place')).toEqual({
      entityName: 'Northwind Collective',
      targetDomain: 'organization',
      sourceHint: 'location',
    });
  });

  it('parses "X is not a place"', () => {
    expect(parseEntityReclassifyRequest('Northwind Collective is not a place')).toEqual({
      entityName: 'Northwind Collective',
      targetDomain: null,
      sourceHint: 'location',
    });
  });

  it('parses move / should be', () => {
    expect(parseEntityReclassifyRequest('move MemoVault to my Projects book')).toMatchObject({
      entityName: 'MemoVault',
      targetDomain: 'project',
    });
    expect(parseEntityReclassifyRequest('Marcus should be a person')).toMatchObject({
      entityName: 'Marcus',
      targetDomain: 'character',
    });
  });
});
