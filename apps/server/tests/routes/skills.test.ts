// =====================================================
// SKILLS ROUTE TESTS
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import skillsRouter from '../../src/routes/skills';
import { requireAuth } from '../../src/middleware/auth';

// Mock dependencies
vi.mock('../../src/services/skills/skillService');
vi.mock('../../src/services/skills/skillExtractionService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');

const app = express();
app.use(express.json());
app.use('/api/skills', skillsRouter);

describe('Skills Routes', () => {
  const mockUser = { id: 'test-user-id', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/skills', () => {
    it('should get all skills', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockSkills = [
        { id: 'skill-1', skill_name: 'JavaScript', skill_category: 'technical' },
        { id: 'skill-2', skill_name: 'Weightlifting', skill_category: 'physical' },
      ];

      vi.mocked(skillService.getSkills).mockResolvedValue(mockSkills as any);

      const response = await request(app)
        .get('/api/skills')
        .expect(200);

      expect(response.body).toHaveProperty('skills');
      expect(response.body.skills).toHaveLength(2);
    });

    it('should filter by active_only', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      vi.mocked(skillService.getSkills).mockResolvedValue([]);

      await request(app)
        .get('/api/skills?active_only=true')
        .expect(200);

      expect(skillService.getSkills).toHaveBeenCalledWith(
        'test-user-id',
        { active_only: true, category: undefined }
      );
    });

    it('should filter by category', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      vi.mocked(skillService.getSkills).mockResolvedValue([]);

      await request(app)
        .get('/api/skills?category=technical')
        .expect(200);

      expect(skillService.getSkills).toHaveBeenCalledWith(
        'test-user-id',
        { active_only: false, category: 'technical' }
      );
    });
  });

  describe('GET /api/skills/:skillId', () => {
    it('should get a single skill', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockSkill = {
        id: 'skill-1',
        skill_name: 'JavaScript',
        skill_category: 'technical',
        total_xp: 1000,
      };

      vi.mocked(skillService.getSkill).mockResolvedValue(mockSkill as any);

      const response = await request(app)
        .get('/api/skills/skill-1')
        .expect(200);

      expect(response.body).toHaveProperty('skill');
      expect(response.body.skill.skill_name).toBe('JavaScript');
      expect(skillService.getSkill).toHaveBeenCalledWith('test-user-id', 'skill-1');
    });

    it('should return 404 if skill not found', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      vi.mocked(skillService.getSkill).mockResolvedValue(null);

      await request(app)
        .get('/api/skills/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/skills', () => {
    it('should create a new skill', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockSkill = {
        id: 'skill-1',
        skill_name: 'JavaScript',
        skill_category: 'technical',
        total_xp: 0,
      };

      vi.mocked(skillService.createSkill).mockResolvedValue(mockSkill as any);

      const response = await request(app)
        .post('/api/skills')
        .send({
          skill_name: 'JavaScript',
          skill_category: 'technical',
        })
        .expect(200);

      expect(response.body).toHaveProperty('skill');
      expect(response.body.skill.skill_name).toBe('JavaScript');
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/skills')
        .send({})
        .expect(400);
    });

    it('should validate skill_category enum', async () => {
      await request(app)
        .post('/api/skills')
        .send({
          skill_name: 'Test',
          skill_category: 'invalid',
        })
        .expect(400);
    });
  });

  describe('PATCH /api/skills/:skillId', () => {
    it('should update a skill', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockSkill = {
        id: 'skill-1',
        skill_name: 'Updated Skill',
        skill_category: 'technical',
      };

      vi.mocked(skillService.updateSkill).mockResolvedValue(mockSkill as any);

      const response = await request(app)
        .patch('/api/skills/skill-1')
        .send({
          skill_name: 'Updated Skill',
        })
        .expect(200);

      expect(response.body).toHaveProperty('skill');
      expect(skillService.updateSkill).toHaveBeenCalledWith(
        'test-user-id',
        'skill-1',
        expect.objectContaining({ skill_name: 'Updated Skill' })
      );
    });
  });

  describe('POST /api/skills/:skillId/xp', () => {
    it('should add XP to a skill', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockResult = {
        skill: { id: 'skill-1', total_xp: 100 },
        xpAdded: 100,
        level: 1,
      };

      vi.mocked(skillService.addXP).mockResolvedValue(mockResult as any);

      const response = await request(app)
        .post('/api/skills/skill-1/xp')
        .send({
          xp_amount: 100,
          source_type: 'manual',
        })
        .expect(200);

      expect(response.body).toHaveProperty('skill');
      expect(response.body.xpAdded).toBe(100);
      expect(skillService.addXP).toHaveBeenCalledWith(
        'test-user-id',
        'skill-1',
        100,
        'manual',
        undefined,
        undefined
      );
    });

    it('should validate XP data', async () => {
      await request(app)
        .post('/api/skills/skill-1/xp')
        .send({
          xp_amount: -10, // Invalid
          source_type: 'manual',
        })
        .expect(400);
    });
  });

  describe('GET /api/skills/:skillId/progress', () => {
    it('should get skill progress history', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      const mockProgress = [
        { id: 'progress-1', xp_added: 100, timestamp: '2024-01-01' },
        { id: 'progress-2', xp_added: 50, timestamp: '2024-01-02' },
      ];

      vi.mocked(skillService.getSkillProgress).mockResolvedValue(mockProgress as any);

      const response = await request(app)
        .get('/api/skills/skill-1/progress')
        .expect(200);

      expect(response.body).toHaveProperty('progress');
      expect(response.body.progress).toHaveLength(2);
      expect(skillService.getSkillProgress).toHaveBeenCalledWith('test-user-id', 'skill-1', 50);
    });

    it('should respect limit query param', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      vi.mocked(skillService.getSkillProgress).mockResolvedValue([]);

      await request(app)
        .get('/api/skills/skill-1/progress?limit=10')
        .expect(200);

      expect(skillService.getSkillProgress).toHaveBeenCalledWith('test-user-id', 'skill-1', 10);
    });
  });

  describe('POST /api/skills/extract', () => {
    it('should extract skills from journal entry', async () => {
      const { skillExtractionService } = await import('../../src/services/skills/skillExtractionService');
      const mockResults = {
        skillsDetected: ['JavaScript', 'React'],
        skillsCreated: ['skill-1', 'skill-2'],
        xpAwarded: [{ skill_id: 'skill-1', xp: 50 }],
      };

      vi.mocked(skillExtractionService.processEntryForSkills).mockResolvedValue(mockResults as any);

      const response = await request(app)
        .post('/api/skills/extract')
        .send({
          entry_id: 'entry-1',
          content: 'I worked on a JavaScript project using React',
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(skillExtractionService.processEntryForSkills).toHaveBeenCalledWith(
        'test-user-id',
        'entry-1',
        'I worked on a JavaScript project using React'
      );
    });

    it('should validate entry_id and content are provided', async () => {
      await request(app)
        .post('/api/skills/extract')
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /api/skills/:skillId', () => {
    it('should delete a skill', async () => {
      const { skillService } = await import('../../src/services/skills/skillService');
      vi.mocked(skillService.deleteSkill).mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/skills/skill-1')
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(skillService.deleteSkill).toHaveBeenCalledWith('test-user-id', 'skill-1');
    });
  });
});
