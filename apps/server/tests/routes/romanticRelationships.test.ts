import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u-romance', email: 'love@test.com' };

const { rescan, enrichRomanticRelationshipsForUser } = vi.hoisted(() => ({
  rescan: vi.fn(),
  enrichRomanticRelationshipsForUser: vi.fn(async (_userId: string, rows: unknown[]) => rows),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../../src/services/romanticConversationRescanService', () => ({
  romanticConversationRescanService: { rescan },
}));

vi.mock('../../src/services/conversationCentered/romanticRelationshipEnrichment', () => ({
  enrichRomanticRelationshipsForUser,
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'rel-001',
                  person_id: 'char-alex',
                  person_type: 'character',
                  relationship_type: 'girlfriend',
                  status: 'active',
                },
              ],
              error: null,
            }),
          })),
        })),
      })),
    }),
  },
}));

import conversationCenteredRouter from '../../src/routes/conversationCentered';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationCenteredRouter);

describe('Romantic Relationships API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rescan.mockResolvedValue({
      scannedEpisodes: 42,
      romanticEpisodes: 8,
      partnersDiscovered: 3,
      relationshipsUpserted: 2,
      interactionsLogged: 2,
      peripheralsUpserted: 0,
      glossaryCuesMatched: 6,
      partnerNames: ['Alex', 'Priya'],
      lexicalHits: [],
    });
  });

  it('GET /romantic-relationships returns enriched list', async () => {
    const res = await request(app)
      .get('/api/conversation/romantic-relationships')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.relationships)).toBe(true);
    expect(enrichRomanticRelationshipsForUser).toHaveBeenCalled();
  });

  it('POST /romantic-relationships/rescan triggers lexical rescan', async () => {
    const res = await request(app)
      .post('/api/conversation/romantic-relationships/rescan')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.summary.relationshipsUpserted).toBe(2);
    expect(rescan).toHaveBeenCalledWith('u-romance');
  });
});
