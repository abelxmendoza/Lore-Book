import { describe, it, expect } from 'vitest';

import { validateCorrection, ROMANTIC_TYPES, ROMANTIC_STATUSES } from './mcpLoreCorrect';

describe('correct_lore — argument validation', () => {
  it('rename requires character_id and a non-empty new name', () => {
    expect(validateCorrection({ action: 'rename_character' }).ok).toBe(false);
    expect(validateCorrection({ action: 'rename_character', character_id: 'x' }).ok).toBe(false);
    expect(
      validateCorrection({
        action: 'rename_character',
        character_id: '11111111-1111-1111-1111-111111111111',
        new_name: 'Vexadoll',
      }).ok,
    ).toBe(true);
  });

  it('reclassification requires the relationship and at least one field', () => {
    expect(validateCorrection({ action: 'set_romantic_classification' }).ok).toBe(false);
    expect(
      validateCorrection({
        action: 'set_romantic_classification',
        relationship_id: '11111111-1111-1111-1111-111111111111',
      }).ok,
    ).toBe(false);
    expect(
      validateCorrection({
        action: 'set_romantic_classification',
        relationship_id: '11111111-1111-1111-1111-111111111111',
        relationship_type: 'crush',
        status: 'unrequited',
      }).ok,
    ).toBe(true);
  });

  it('exclude/confirm require the relationship id', () => {
    expect(validateCorrection({ action: 'exclude_from_dating' }).ok).toBe(false);
    expect(
      validateCorrection({
        action: 'confirm_romantic',
        relationship_id: '11111111-1111-1111-1111-111111111111',
      }).ok,
    ).toBe(true);
  });

  it('vocabularies cover the lifecycle states shipped in the trust floor', () => {
    expect(ROMANTIC_TYPES).toContain('crush');
    expect(ROMANTIC_TYPES).toContain('one_night_stand');
    expect(ROMANTIC_STATUSES).toContain('unrequited');
    expect(ROMANTIC_STATUSES).toContain('fading');
  });
});
