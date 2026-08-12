import { describe, expect, it } from 'vitest';
import type { RomanticPeripheral } from '../api/romanticPeripherals';
import { isExPartnerPeripheral, partitionRomanticPeripherals } from './romanticExPartners';

function row(id: string, role: string, tier: RomanticPeripheral['tier'] = 'confirmed'): RomanticPeripheral {
  return {
    id,
    anchor_relationship_id: 'rel-1',
    anchor_person_id: 'person-1',
    anchor_person_type: 'character',
    peripheral_person_id: `char-${id}`,
    peripheral_person_type: 'character',
    peripheral_surface: id,
    role,
    tier,
    confidence: 0.9,
    has_met: false,
    proximity: 'third_party',
    associated_via: 'chat_extract',
    source_message_ids: [],
  };
}

describe('romanticExPartners', () => {
  it('recognizes historical ex-partner role spellings', () => {
    for (const role of [
      'ex',
      'ex_partner',
      'former partner',
      'ex-boyfriend',
      'ex_girlfriend',
      'ex_husband',
      'ex_wife',
      'ex_lover',
    ]) {
      expect(isExPartnerPeripheral(row(role, role)), role).toBe(true);
    }
  });

  it('does not treat current or suspected side connections as exes', () => {
    for (const role of ['current_partner', 'side_partner', 'crush']) {
      expect(isExPartnerPeripheral(row(role, role))).toBe(false);
    }
  });

  it('excludes dismissed exes', () => {
    expect(isExPartnerPeripheral(row('dismissed', 'ex', 'dismissed'))).toBe(false);
  });

  it('partitions ex-partners from other romantic connections', () => {
    const result = partitionRomanticPeripherals([
      row('alex', 'ex'),
      row('jamie', 'current_partner'),
      row('taylor', 'former_partner'),
    ]);
    expect(result.exPartners.map((p) => p.id)).toEqual(['alex', 'taylor']);
    expect(result.otherConnections.map((p) => p.id)).toEqual(['jamie']);
  });
});
