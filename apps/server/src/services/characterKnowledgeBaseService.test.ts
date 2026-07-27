import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

type Claim = {
  id: string;
  human_readable_claim: string;
  knowledge_type: string;
  confidence: number;
  status: string;
  last_reinforced_at: string;
  first_evidenced_at: string;
};
type Link = { knowledge_id: string; evidence_summary: string };

function mockTables(claims: Claim[], links: Link[]) {
  return vi.fn((table: string) => {
    if (table === 'crystallized_knowledge') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: claims, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'knowledge_evidence_links') {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: links, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('loadKnowledgeClaimsForCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches a claim whose evidence only mentions the character by alias, not their canonical name', async () => {
    const claims: Claim[] = [
      {
        id: 'claim-1',
        human_readable_claim: 'Always shows up for family events',
        knowledge_type: 'pattern',
        confidence: 0.85,
        status: 'ACTIVE',
        last_reinforced_at: '2026-01-01',
        first_evidenced_at: '2026-01-01',
      },
    ];
    const links: Link[] = [
      { knowledge_id: 'claim-1', evidence_summary: 'Ralph came through for the move again' },
    ];

    const { supabaseAdmin } = await import('./supabaseClient');
    (supabaseAdmin as any).from = mockTables(claims, links);

    const { loadKnowledgeClaimsForCharacter } = await import('./characterKnowledgeBaseService');
    // Canonical name is "Tio Ralph"; evidence only says "Ralph" — the alias.
    const result = await loadKnowledgeClaimsForCharacter('user-1', 'Tio Ralph', ['Ralph']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('claim-1');
  });

  it('still matches by canonical name when no alias is needed', async () => {
    const claims: Claim[] = [
      {
        id: 'claim-2',
        human_readable_claim: 'Builder pattern',
        knowledge_type: 'pattern',
        confidence: 0.7,
        status: 'ACTIVE',
        last_reinforced_at: '2026-01-01',
        first_evidenced_at: '2026-01-01',
      },
    ];
    const links: Link[] = [{ knowledge_id: 'claim-2', evidence_summary: 'Jamie built the whole thing' }];

    const { supabaseAdmin } = await import('./supabaseClient');
    (supabaseAdmin as any).from = mockTables(claims, links);

    const { loadKnowledgeClaimsForCharacter } = await import('./characterKnowledgeBaseService');
    const result = await loadKnowledgeClaimsForCharacter('user-1', 'Jamie', []);

    expect(result).toHaveLength(1);
  });

  it('excludes a claim whose evidence mentions neither the name nor any alias', async () => {
    const claims: Claim[] = [
      {
        id: 'claim-3',
        human_readable_claim: 'Unrelated pattern',
        knowledge_type: 'pattern',
        confidence: 0.6,
        status: 'ACTIVE',
        last_reinforced_at: '2026-01-01',
        first_evidenced_at: '2026-01-01',
      },
    ];
    const links: Link[] = [{ knowledge_id: 'claim-3', evidence_summary: 'Someone else entirely' }];

    const { supabaseAdmin } = await import('./supabaseClient');
    (supabaseAdmin as any).from = mockTables(claims, links);

    const { loadKnowledgeClaimsForCharacter } = await import('./characterKnowledgeBaseService');
    const result = await loadKnowledgeClaimsForCharacter('user-1', 'Jamie', ['Jimmy']);

    expect(result).toHaveLength(0);
  });
});
