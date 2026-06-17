import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { characterRegistry } from './characterRegistry';
import { supabaseAdmin } from './supabaseClient';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('characterRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not auto-merge a bare first name into a contextual kinship name', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'locations' || table === 'organizations' || table === 'omega_entities') return chain([]);
      if (table === 'characters') {
        return chain([{ id: 'tio-juan', name: 'Uncle James', alias: [], metadata: {} }]);
      }
      if (table === 'entity_facts') return chain([]);
      return chain([]);
    });

    const decision = await characterRegistry.classifyForCreation('user-1', 'Juan');

    expect(decision.action).toBe('create');
  });

  it('still merges an exact alias match', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'locations' || table === 'organizations' || table === 'omega_entities') return chain([]);
      if (table === 'characters') {
        return chain([{ id: 'oscuridad', name: 'Juan / Neon Pulsedad', alias: ['Neon Pulsedad'], metadata: {} }]);
      }
      return chain([]);
    });

    const decision = await characterRegistry.classifyForCreation('user-1', 'Neon Pulsedad');

    expect(decision).toMatchObject({
      action: 'merge',
      characterId: 'oscuridad',
      cleanName: 'Neon Pulsedad',
    });
  });

  it('does not deliver global pending questions into unrelated threads', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'entity_questions') {
        return chain([
          {
            id: 'q1',
            mention_text: 'Fairy',
            candidates: [
              { character_id: 'a', name: 'Velvet Hour' },
              { character_id: 'b', name: 'Mr. Chino' },
            ],
            asked_count: 0,
            thread_id: null,
          },
        ]);
      }
      return chain([]);
    });

    const result = await characterRegistry.takeNextPendingQuestion('user-1', {
      message: 'Testing LifeLedger features',
      threadId: 'thread-dev',
      conversationHistory: [
        { role: 'user', content: 'Building the product with Codex' },
      ],
    });

    expect(result).toBeNull();
  });
});
