import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const TEST_USER = { id: 'user-1', email: 'u@test.com' };

const m = vi.hoisted(() => ({
  excludeMember: vi.fn(),
  keepMember: vi.fn(),
  deleteMember: vi.fn(),
  setMemberRelationship: vi.fn(),
  ensureMemberCard: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as express.Request & { user?: typeof TEST_USER }).user = TEST_USER;
    next();
  },
}));

vi.mock('../../src/services/familyTreeService', () => ({
  familyTreeService: {
    excludeMember: (...a: unknown[]) => m.excludeMember(...a),
    keepMember: (...a: unknown[]) => m.keepMember(...a),
    deleteMember: (...a: unknown[]) => m.deleteMember(...a),
    setMemberRelationship: (...a: unknown[]) => m.setMemberRelationship(...a),
    ensureMemberCard: (...a: unknown[]) => m.ensureMemberCard(...a),
    getUserFamilyTree: vi.fn(),
    getCharacterFamilyTree: vi.fn(),
    getOrganizationFamilyTree: vi.fn(),
    getCharacterAffiliations: vi.fn(),
    getMemberAffiliationsForOrganization: vi.fn(),
  },
}));

vi.mock('../../src/services/conversationCentered/characterTimelineBuilder', () => ({
  characterTimelineBuilder: { rebuildTimelinesForCharacter: vi.fn() },
}));

import familyTreesRouter from '../../src/routes/familyTrees';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/family-trees', familyTreesRouter);
  return a;
}

describe('family-tree member mutation routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /member/:id/exclude', () => {
    it('200 + passes user, id, reason to the service', async () => {
      m.excludeMember.mockResolvedValue(true);
      await request(app())
        .post('/api/family-trees/member/char-1/exclude')
        .send({ reason: 'not kin' })
        .expect(200);
      expect(m.excludeMember).toHaveBeenCalledWith('user-1', 'char-1', 'not kin');
    });
    it('404 when the service refuses', async () => {
      m.excludeMember.mockResolvedValue(false);
      await request(app()).post('/api/family-trees/member/__user__/exclude').send({}).expect(404);
    });
  });

  describe('POST /member/:id/keep', () => {
    it('200 clears the review flag', async () => {
      m.keepMember.mockResolvedValue(true);
      await request(app()).post('/api/family-trees/member/char-1/keep').send({}).expect(200);
      expect(m.keepMember).toHaveBeenCalledWith('user-1', 'char-1');
    });
  });

  describe('DELETE /member/:id', () => {
    it('200 deletes via the service', async () => {
      m.deleteMember.mockResolvedValue(true);
      const res = await request(app())
        .delete('/api/family-trees/member/char-1')
        .send({ reason: 'not a person' })
        .expect(200);
      expect(res.body.deleted).toBe(true);
      expect(m.deleteMember).toHaveBeenCalledWith('user-1', 'char-1', 'not a person');
    });
    it('404 when not deletable', async () => {
      m.deleteMember.mockResolvedValue(false);
      await request(app()).delete('/api/family-trees/member/name-2').send({}).expect(404);
    });
  });

  describe('PATCH /member/:id/relationship', () => {
    it('200 + forwards relation/side', async () => {
      m.setMemberRelationship.mockResolvedValue(true);
      await request(app())
        .patch('/api/family-trees/member/char-1/relationship')
        .send({ relation: 'aunt', side: 'maternal' })
        .expect(200);
      expect(m.setMemberRelationship).toHaveBeenCalledWith('user-1', 'char-1', {
        relation: 'aunt',
        connectsToId: undefined,
        side: 'maternal',
      });
    });
    it('400 when relation is missing', async () => {
      await request(app()).patch('/api/family-trees/member/char-1/relationship').send({}).expect(400);
      expect(m.setMemberRelationship).not.toHaveBeenCalled();
    });
  });

  describe('POST /member/:id/ensure-card', () => {
    it('200 returns the (created) character', async () => {
      m.ensureMemberCard.mockResolvedValue({ character: { id: 'new-1', name: 'Grace' }, created: true });
      const res = await request(app())
        .post('/api/family-trees/member/name-0/ensure-card')
        .send({ name: 'Grace' })
        .expect(200);
      expect(res.body.character.id).toBe('new-1');
      expect(res.body.created).toBe(true);
      expect(m.ensureMemberCard).toHaveBeenCalledWith('user-1', 'name-0', 'Grace');
    });
    it('422 when no card can be made (registry refused)', async () => {
      m.ensureMemberCard.mockResolvedValue(null);
      await request(app()).post('/api/family-trees/member/name-0/ensure-card').send({ name: 'x' }).expect(422);
    });
  });
});
