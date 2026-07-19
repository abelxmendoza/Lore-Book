import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUser = { id: 'user-recurring-scenes', email: 'synthetic@example.test' };

const { from, queryResults, selectedColumns } = vi.hoisted(() => ({
  from: vi.fn(),
  queryResults: [] as Array<{ data: unknown; error: unknown }>,
  selectedColumns: [] as string[],
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from },
}));

import conversationCenteredRouter from '../../src/routes/conversationCentered';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationCenteredRouter);

function queryChain() {
  const chain = {
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockImplementation(async () => queryResults.shift());
  return chain;
}

describe('Recurring event candidates API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults.length = 0;
    selectedColumns.length = 0;
    from.mockImplementation((table: string) => {
      expect(table).toBe('event_candidates');
      return {
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          return queryChain();
        }),
      };
    });
  });

  it('falls back to the legacy schema when emotional_tone is missing', async () => {
    queryResults.push(
      { data: null, error: { code: 'PGRST204', message: 'column not found' } },
      {
        data: [
          {
            id: 'candidate-1',
            canonical_title: 'Planning at Vanguard Robotics',
            occurrence_count: 3,
            continuity_strength: 0.72,
          },
        ],
        error: null,
      }
    );

    const response = await request(app)
      .get('/api/conversation/event-candidates')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.scenes).toHaveLength(1);
    expect(selectedColumns).toHaveLength(2);
    expect(selectedColumns[0]).toContain('emotional_tone');
    expect(selectedColumns[1]).not.toContain('emotional_tone');
  });
});
