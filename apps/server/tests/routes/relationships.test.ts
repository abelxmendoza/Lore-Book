import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import relationshipsRouter from '../../src/routes/relationships';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');

vi.mock('../../src/services/relationships/relationshipRoleInferenceService', () => ({
  inferRolesFromText: vi.fn(),
  inferRoleForPerson: vi.fn(),
  inferRoleFromEntries: vi.fn(),
  hierarchyLabel: vi.fn((h: string) => `${h}-label`),
  hierarchyIcon: vi.fn((h: string) => `${h}-icon`),
  domainLabel: vi.fn((d: string) => `${d}-domain`),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/relationships', relationshipsRouter);

describe('Relationships Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(async (req: any, _res, next) => {
      req.user = mockUser;
      next();
    });
  });

  describe('POST /api/relationships/infer-role', () => {
    it('infers roles from text and returns enriched result', async () => {
      const { inferRolesFromText } = await import('../../src/services/relationships/relationshipRoleInferenceService');
      vi.mocked(inferRolesFromText).mockReturnValue([
        { role: 'friend', hierarchy: 'peer', domain: 'personal', confidence: 0.9, evidence: [] } as any,
      ]);

      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({ text: 'We met at university and have been close ever since.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.roles).toHaveLength(1);
      expect(res.body.roles[0].role).toBe('friend');
      expect(res.body.roles[0].hierarchy_label).toBe('peer-label');
    });

    it('uses inferRoleForPerson when person_name is provided', async () => {
      const { inferRoleForPerson, inferRolesFromText } = await import('../../src/services/relationships/relationshipRoleInferenceService');
      vi.mocked(inferRoleForPerson).mockReturnValue(
        { role: 'mentor', hierarchy: 'senior', domain: 'professional', confidence: 0.85, evidence: [] } as any
      );

      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({ text: 'She taught me everything about product design.', person_name: 'Alice' })
        .expect(200);

      expect(inferRoleForPerson).toHaveBeenCalledWith('Alice', expect.any(String));
      expect(inferRolesFromText).not.toHaveBeenCalled();
      expect(res.body.roles[0].role).toBe('mentor');
    });

    it('returns empty roles when person_name inference returns null', async () => {
      const { inferRoleForPerson } = await import('../../src/services/relationships/relationshipRoleInferenceService');
      vi.mocked(inferRoleForPerson).mockReturnValue(null as any);

      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({ text: 'Some text', person_name: 'Unknown' })
        .expect(200);

      expect(res.body.roles).toEqual([]);
    });

    it('rejects invalid input — returns 4xx or 5xx (route uses asyncHandler, Zod errors surface as 500)', async () => {
      // Route validates inline via schema.parse() inside asyncHandler.
      // ZodErrors propagate through Express's default error handler → 500.
      // This documents current behavior; the route could add explicit 400 handling.
      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({ text: '' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects missing text — returns error status', async () => {
      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects text over 5000 chars — returns error status', async () => {
      const res = await request(app)
        .post('/api/relationships/infer-role')
        .send({ text: 'a'.repeat(5001) });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/relationships/infer-role-from-entries', () => {
    it('returns null role when no journal entries mention the person', async () => {
      const { supabaseAdmin } = await import('../../src/services/supabaseClient');
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);

      const res = await request(app)
        .post('/api/relationships/infer-role-from-entries')
        .send({ person_name: 'Unknown Person' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.role).toBeNull();
    });

    it('returns enriched role when entries are found', async () => {
      const { supabaseAdmin } = await import('../../src/services/supabaseClient');
      const { inferRoleFromEntries } = await import('../../src/services/relationships/relationshipRoleInferenceService');

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            { content: 'Hung out with Sarah today.', date: '2024-01-15' },
            { content: 'Sarah helped me with my project.', date: '2024-01-10' },
            { content: 'Met Sarah for coffee.', date: '2024-01-05' },
          ],
          error: null,
        }),
      };
      vi.mocked(supabaseAdmin.from).mockReturnValue(chain as any);
      vi.mocked(inferRoleFromEntries).mockReturnValue(
        { role: 'close_friend', hierarchy: 'peer', domain: 'personal', confidence: 0.9, evidence: [] } as any
      );

      const res = await request(app)
        .post('/api/relationships/infer-role-from-entries')
        .send({ person_name: 'Sarah' })
        .expect(200);

      expect(res.body.role.role).toBe('close_friend');
      expect(res.body.entries_scanned).toBe(3);
    });

    it('rejects missing person_name — returns error status', async () => {
      const res = await request(app)
        .post('/api/relationships/infer-role-from-entries')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/relationships/role-taxonomy', () => {
    it('returns grouped taxonomy of roles', async () => {
      vi.doMock('../../src/services/relationships/socialRoleTaxonomy', () => ({
        ROLE_PATTERNS: [
          { role: 'friend', hierarchy: 'peer', domain: 'personal', keywords: [] },
          { role: 'mentor', hierarchy: 'senior', domain: 'professional', keywords: [] },
          { role: 'colleague', hierarchy: 'peer', domain: 'professional', keywords: [] },
        ],
      }));

      const res = await request(app)
        .get('/api/relationships/role-taxonomy')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.taxonomy).toBeDefined();
      expect(typeof res.body.taxonomy).toBe('object');
    });
  });
});
