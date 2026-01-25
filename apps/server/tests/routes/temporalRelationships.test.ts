import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { temporalRelationshipsRouter } from '../../src/routes/temporalRelationships';
import { requireAuth } from '../../src/middleware/auth';
import * as temporalRelationshipQueries from '../../src/services/temporalRelationshipQueries';
import { fetchActiveTemporalEdges } from '../../src/er/temporalEdgeService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/temporalRelationshipQueries');
vi.mock('../../src/er/temporalEdgeService', () => ({ fetchActiveTemporalEdges: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/api/relationships', temporalRelationshipsRouter);

describe('Temporal Relationships API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/relationships/by-scope', () => {
    it('returns edges and snapshots for valid scope and time range', async () => {
      vi.mocked(temporalRelationshipQueries.getRelationshipsByScope).mockResolvedValue({
        edges: [{ id: 'e1', scope: 'work' }],
        snapshots: [{ relationship_id: 'e1', phase: 'ACTIVE' }],
      });

      const response = await request(app)
        .get('/api/relationships/by-scope')
        .query({ scope: 'work', start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' })
        .expect(200);

      expect(response.body).toHaveProperty('edges');
      expect(response.body).toHaveProperty('snapshots');
      expect(response.body.edges).toHaveLength(1);
      expect(temporalRelationshipQueries.getRelationshipsByScope).toHaveBeenCalledWith(
        mockUser.id,
        'work',
        { start: '2024-01-01T00:00:00.000Z', end: '2024-12-31T23:59:59.000Z' }
      );
    });

    it('returns 400 when scope is missing or invalid', async () => {
      await request(app)
        .get('/api/relationships/by-scope')
        .query({ start: '2024-01-01', end: '2024-12-31' })
        .expect(400);

      await request(app)
        .get('/api/relationships/by-scope')
        .query({ scope: 'invalid', start: '2024-01-01', end: '2024-12-31' })
        .expect(400);
    });

    it('returns 400 when start or end is missing or invalid', async () => {
      await request(app)
        .get('/api/relationships/by-scope')
        .query({ scope: 'work' })
        .expect(400);

      await request(app)
        .get('/api/relationships/by-scope')
        .query({ scope: 'work', start: 'not-iso', end: '2024-12-31' })
        .expect(400);
    });

    it('returns 400 when start > end', async () => {
      await request(app)
        .get('/api/relationships/by-scope')
        .query({ scope: 'work', start: '2024-12-31', end: '2024-01-01' })
        .expect(400);
    });
  });

  describe('GET /api/relationships/fading', () => {
    it('returns fading connections without scope filter', async () => {
      vi.mocked(temporalRelationshipQueries.getFadingConnections).mockResolvedValue({
        edges: [{ id: 'e1' }],
        snapshots: [{ relationship_id: 'e1', phase: 'WEAK' }],
      });

      const response = await request(app)
        .get('/api/relationships/fading')
        .expect(200);

      expect(response.body.edges).toHaveLength(1);
      expect(temporalRelationshipQueries.getFadingConnections).toHaveBeenCalledWith(mockUser.id, undefined);
    });

    it('returns fading connections with optional scope', async () => {
      vi.mocked(temporalRelationshipQueries.getFadingConnections).mockResolvedValue({ edges: [], snapshots: [] });

      await request(app)
        .get('/api/relationships/fading')
        .query({ scope: 'work' })
        .expect(200);

      expect(temporalRelationshipQueries.getFadingConnections).toHaveBeenCalledWith(mockUser.id, 'work');
    });

    it('returns 400 when scope is invalid', async () => {
      await request(app)
        .get('/api/relationships/fading')
        .query({ scope: 'invalid' })
        .expect(400);
    });
  });

  describe('GET /api/relationships/core-for-era', () => {
    it('returns core people for valid scope and era range', async () => {
      vi.mocked(temporalRelationshipQueries.getCorePeopleForEra).mockResolvedValue({
        edges: [{ id: 'e1', scope: 'family' }],
        snapshots: [{ relationship_id: 'e1', phase: 'CORE' }],
      });

      const response = await request(app)
        .get('/api/relationships/core-for-era')
        .query({ scope: 'family', start: '2024-01-01T00:00:00Z', end: '2024-06-30T23:59:59Z' })
        .expect(200);

      expect(response.body.edges).toHaveLength(1);
      expect(temporalRelationshipQueries.getCorePeopleForEra).toHaveBeenCalledWith(
        mockUser.id,
        'family',
        { start: '2024-01-01T00:00:00.000Z', end: '2024-06-30T23:59:59.000Z' }
      );
    });

    it('returns 400 when scope is missing or invalid', async () => {
      await request(app)
        .get('/api/relationships/core-for-era')
        .query({ start: '2024-01-01', end: '2024-12-31' })
        .expect(400);
    });

    it('returns 400 when start or end is invalid or start > end', async () => {
      await request(app)
        .get('/api/relationships/core-for-era')
        .query({ scope: 'family', start: '2024-12-31', end: '2024-01-01' })
        .expect(400);
    });
  });

  describe('GET /api/relationships/insights', () => {
    it('returns insights from fetchActiveTemporalEdges and generateRelationshipInsights', async () => {
      const old = new Date();
      old.setDate(old.getDate() - 50);
      vi.mocked(fetchActiveTemporalEdges).mockResolvedValue([
        {
          id: 'e1',
          kind: 'ASSERTED',
          phase: 'WEAK',
          last_evidence_at: old.toISOString(),
          to_entity_id: 'ent-1',
          confidence: 0.35,
          evidence_source_ids: [],
          scope: 'work',
        },
      ]);

      const response = await request(app).get('/api/relationships/insights').expect(200);

      expect(response.body).toHaveProperty('insights');
      expect(Array.isArray(response.body.insights)).toBe(true);
      expect(fetchActiveTemporalEdges).toHaveBeenCalledWith(mockUser.id);

      if (response.body.insights.length > 0) {
        const i = response.body.insights[0];
        expect(i).toHaveProperty('type');
        expect(i).toHaveProperty('entity_id');
        expect(i).toHaveProperty('scope');
        expect(i).toHaveProperty('phase');
        expect(i).toHaveProperty('confidence');
        expect(i).toHaveProperty('explanation');
        expect(i).toHaveProperty('supporting_evidence');
        expect(i.supporting_evidence).toHaveProperty('evidence_count');
        expect(i.supporting_evidence).toHaveProperty('age_days');
      }
    });

    it('returns empty insights when fetchActiveTemporalEdges returns empty', async () => {
      vi.mocked(fetchActiveTemporalEdges).mockResolvedValue([]);

      const response = await request(app).get('/api/relationships/insights').expect(200);

      expect(response.body.insights).toEqual([]);
    });
  });
});
