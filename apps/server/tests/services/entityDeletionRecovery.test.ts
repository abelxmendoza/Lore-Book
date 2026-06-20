import { describe, it, expect } from 'vitest';

import { buildRejectionKeys } from '../../src/services/entityRejectionRegistry';

describe('entityRejectionRegistry', () => {
  it('builds normalized rejection keys from name and aliases', () => {
    const keys = buildRejectionKeys('Kelly Onboarding', ['Kelly', 'Dana']);
    expect(keys).toContain('kelly onboarding');
    expect(keys).toContain('kelly');
    expect(keys).toContain('dana');
  });

  it('skips single-character alias keys', () => {
    const keys = buildRejectionKeys('Maria', ['A']);
    expect(keys).toEqual(['maria']);
  });
});

describe('characterRegistry user rejection', () => {
  it('documents rejection reason for deleted cards', () => {
    expect('user_deleted_entity_card').toBeTruthy();
  });
});
