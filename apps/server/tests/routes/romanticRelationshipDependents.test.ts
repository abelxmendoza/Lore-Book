import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u-romance', email: 'love@test.com' };

const {
  getKidsTogetherForRelationship,
  getPetsTogetherForRelationship,
  linkDependentToRomanticRelationship,
  unlinkDependentFromRomanticRelationship,
} = vi.hoisted(() => ({
  getKidsTogetherForRelationship: vi.fn(),
  getPetsTogetherForRelationship: vi.fn(),
  linkDependentToRomanticRelationship: vi.fn(),
  unlinkDependentFromRomanticRelationship: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../../src/services/familyTreeService', () => ({
  familyTreeService: {
    getKidsTogetherForRelationship,
    getPetsTogetherForRelationship,
    linkDependentToRomanticRelationship,
    unlinkDependentFromRomanticRelationship,
  },
}));

const relRow = {
  id: 'rel-001',
  person_id: 'partner-1',
  person_type: 'character',
  character_id: 'partner-1',
  relationship_type: 'dating',
  metadata: {},
};

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: relRow, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import conversationCenteredRouter from '../../src/routes/conversationCentered';

const app = express();
app.use(express.json());
app.use('/api/conversation', conversationCenteredRouter);

describe('Romantic relationship kids/pets write API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getKidsTogetherForRelationship.mockResolvedValue([]);
    getPetsTogetherForRelationship.mockResolvedValue([]);
    linkDependentToRomanticRelationship.mockResolvedValue({
      ok: true,
      kids: [{ id: 'riley', name: 'Riley', relation: 'together', belongsTo: 'both', coParents: [] }],
      pets: [],
    });
    unlinkDependentFromRomanticRelationship.mockResolvedValue({
      ok: true,
      kids: [],
      pets: [],
    });
  });

  it('POST /romantic-relationships/:id/kids links a child', async () => {
    const res = await request(app)
      .post('/api/conversation/romantic-relationships/rel-001/kids')
      .send({ kind: 'child', name: 'Riley', belongsTo: 'both' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.kids[0].name).toBe('Riley');
    expect(linkDependentToRomanticRelationship).toHaveBeenCalledWith(
      mockUser.id,
      'partner-1',
      'dating',
      expect.objectContaining({ kind: 'child', name: 'Riley', belongsTo: 'both' }),
    );
  });

  it('POST /romantic-relationships/:id/kids rejects a body without a name or character', async () => {
    const res = await request(app)
      .post('/api/conversation/romantic-relationships/rel-001/kids')
      .send({ kind: 'pet' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(linkDependentToRomanticRelationship).not.toHaveBeenCalled();
  });

  it('DELETE /romantic-relationships/:id/kids/:characterId unlinks without deleting the card', async () => {
    const res = await request(app)
      .delete('/api/conversation/romantic-relationships/rel-001/kids/riley?kind=child')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.kids).toEqual([]);
    expect(unlinkDependentFromRomanticRelationship).toHaveBeenCalledWith(
      mockUser.id,
      'partner-1',
      'dating',
      'riley',
      'child',
    );
  });
});
