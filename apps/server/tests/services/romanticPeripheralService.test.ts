import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const peripheralRow = {
    id: 'periph-1',
    user_id: 'u-1',
    anchor_relationship_id: 'rel-003',
    anchor_person_id: 'char-sam',
    anchor_person_type: 'character',
    peripheral_person_id: null,
    peripheral_person_type: null,
    peripheral_surface: 'Marcus',
    role: 'side_partner',
    tier: 'suspected',
    confidence: 0.85,
    has_met: false,
    proximity: 'third_party',
    associated_via: 'chat_extract',
    source_message_ids: ['msg-1'],
    metadata: { lexical_evidence: 'test' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    peripheralRow,
    resolveRomanticPartner: vi.fn(),
    from: vi.fn(),
  };
});

vi.mock('../../src/services/romanticLexicalIngestionService', () => ({
  resolveRomanticPartner: mocks.resolveRomanticPartner,
}));

vi.mock('../../src/services/supabaseClient', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  mocks.from.mockReturnValue(chain);
  return { supabaseAdmin: { from: mocks.from } };
});

import {
  applyVicariousRelationshipHit,
  ingestRelationshipPeripheralsFromMessage,
  listPeripheralsForCharacter,
  listPeripheralsForRelationship,
} from '../../src/services/relationshipPeripheralService';

describe('romanticPeripheralService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRomanticPartner.mockImplementation(async (_uid: string, name: string) => {
      if (name === 'Sam') return { personId: 'char-sam', personType: 'character', name: 'Sam' };
      if (name === 'Marcus') return null;
      return null;
    });

    const chain = mocks.from();
    chain.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'rel-003' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    chain.single.mockResolvedValue({ data: mocks.peripheralRow, error: null });
    chain.insert.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
  });

  it('ingests vicarious message', async () => {
    const result = await ingestRelationshipPeripheralsFromMessage(
      'u-1',
      'Sam was texting Marcus while we were still seeing each other.',
      'msg-1',
      ['Sam']
    );
    expect(result.saved).toBeGreaterThanOrEqual(0);
  });

  it('applyVicariousHit resolves anchor and upserts', async () => {
    const hit = {
      domain: 'romantic' as const,
      subjectName: 'Sam',
      objectName: null,
      objectSurface: 'Marcus',
      role: 'side_partner' as const,
      tier: 'suspected' as const,
      confidence: 0.85,
      evidence: 'test evidence',
      cues: ['texting another'],
      ontologyTags: ['ROMANTIC/VICARIOUS/SUSPECTED'],
      hasMet: false,
      proximity: 'third_party' as const,
    };

    const saved = await applyVicariousRelationshipHit('u-1', hit, 'msg-1');
    expect(saved).toBeTruthy();
    expect(mocks.resolveRomanticPartner).toHaveBeenCalledWith('u-1', 'Sam');
  });

  it('lists peripherals for character', async () => {
    const chain = mocks.from();
    chain.neq.mockResolvedValue({
      data: [{ ...mocks.peripheralRow, domain: 'social' }],
      error: null,
    });

    const rows = await listPeripheralsForCharacter('u-1', 'char-sam');
    expect(rows).toHaveLength(1);
  });

  it('lists peripherals for relationship', async () => {
    const chain = mocks.from();
    chain.neq.mockResolvedValue({ data: [mocks.peripheralRow], error: null });

    const rows = await listPeripheralsForRelationship('u-1', 'rel-003');
    expect(rows).toHaveLength(1);
    expect(rows[0].peripheral_surface).toBe('Marcus');
  });
});
