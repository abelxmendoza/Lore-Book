import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import skillsRouter from '../../src/routes/skills';
import { requireAuth } from '../../src/middleware/auth';
import { skillService } from '../../src/services/skills/skillService';
import { skillExtractionService } from '../../src/services/skills/skillExtractionService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/skills/skillService');
vi.mock('../../src/services/skills/skillExtractionService');

const app = express();
app.use(express.json());
app.use('/api/skills', skillsRouter);

describe('Skills API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/skills', () => {
    it('should return skills list', async () => {
      const mockSkills = [{ id: 's1', skill_name: 'Writing', skill_category: 'creative' }];
      vi.mocked(skillService.getSkills).mockResolvedValue(mockSkills as any);

      const response = await request(app)
        .get('/api/skills')
        .expect(200);

      expect(response.body).toEqual({ skills: mockSkills });
      expect(skillService.getSkills).toHaveBeenCalledWith(mockUser.id, { active_only: false, category: undefined });
    });

    it('should pass active_only and category', async () => {
      vi.mocked(skillService.getSkills).mockResolvedValue([]);
      await request(app)
        .get('/api/skills?active_only=true&category=professional')
        .expect(200);
      expect(skillService.getSkills).toHaveBeenCalledWith(mockUser.id, {
        active_only: true,
        category: 'professional',
      });
    });
  });

  describe('GET /api/skills/:skillId', () => {
    it('should return a skill', async () => {
      const mockSkill = { id: 's1', skill_name: 'Writing' };
      vi.mocked(skillService.getSkill).mockResolvedValue(mockSkill as any);

      const response = await request(app)
        .get('/api/skills/s1')
        .expect(200);

      expect(response.body).toEqual({ skill: mockSkill });
    });

    it('should return 404 when skill not found', async () => {
      vi.mocked(skillService.getSkill).mockResolvedValue(null);

      await request(app)
        .get('/api/skills/unknown')
        .expect(404);
    });
  });

  describe('POST /api/skills', () => {
    it('should create a skill', async () => {
      const created = { id: 's1', skill_name: 'Cooking', skill_category: 'practical' };
      vi.mocked(skillService.createSkill).mockResolvedValue(created as any);

      const response = await request(app)
        .post('/api/skills')
        .send({
          skill_name: 'Cooking',
          skill_category: 'practical',
        })
        .expect(200);

      expect(response.body.skill).toEqual(created);
    });

    it('should return 400 for invalid body', async () => {
      await request(app)
        .post('/api/skills')
        .send({ skill_name: 'X', skill_category: 'invalid_category' })
        .expect(400);
    });
  });

  describe('PATCH /api/skills/:skillId', () => {
    it('should update a skill', async () => {
      const updated = { id: 's1', skill_name: 'Advanced Cooking' };
      vi.mocked(skillService.updateSkill).mockResolvedValue(updated as any);

      const response = await request(app)
        .patch('/api/skills/s1')
        .send({ skill_name: 'Advanced Cooking' })
        .expect(200);

      expect(response.body.skill).toEqual(updated);
    });
  });

  describe('POST /api/skills/:skillId/xp', () => {
    it('should add XP', async () => {
      const result = { xp_added: 10, new_total: 110 };
      vi.mocked(skillService.addXP).mockResolvedValue(result as any);

      const response = await request(app)
        .post('/api/skills/s1/xp')
        .send({ xp_amount: 10, source_type: 'memory' })
        .expect(200);

      expect(response.body).toEqual(result);
    });
  });

  describe('GET /api/skills/:skillId/progress', () => {
    it('should return progress history', async () => {
      const progress = [{ date: '2024-01-01', xp: 10 }];
      vi.mocked(skillService.getSkillProgress).mockResolvedValue(progress as any);

      const response = await request(app)
        .get('/api/skills/s1/progress')
        .expect(200);

      expect(response.body).toEqual({ progress });
    });
  });

  describe('POST /api/skills/extract', () => {
    it('should extract skills from entry', async () => {
      const results = { skills: ['Writing'], created: 1 };
      vi.mocked(skillExtractionService.processEntryForSkills).mockResolvedValue(results as any);

      const response = await request(app)
        .post('/api/skills/extract')
        .send({ entry_id: 'e1', content: 'I wrote a short story today.' })
        .expect(200);

      expect(response.body).toEqual({ results });
    });

    it('should return 400 when entry_id or content missing', async () => {
      await request(app)
        .post('/api/skills/extract')
        .send({ entry_id: 'e1' })
        .expect(400);
    });
  });

  describe('DELETE /api/skills/:skillId', () => {
    it('should delete a skill', async () => {
      vi.mocked(skillService.deleteSkill).mockResolvedValue(undefined as any);

      const response = await request(app)
        .delete('/api/skills/s1')
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(skillService.deleteSkill).toHaveBeenCalledWith(mockUser.id, 's1');
    });
  });

  describe('GET /api/skills/:skillId/details', () => {
    it('should return skill details', async () => {
      const details = { id: 's1', skill_name: 'Writing', milestones: [] };
      vi.mocked(skillService.getSkillDetails).mockResolvedValue(details as any);

      const response = await request(app)
        .get('/api/skills/s1/details')
        .expect(200);

      expect(response.body).toEqual({ skill: details });
    });
  });
});
