import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { omegaMemoryRouter } from '../../src/routes/omegaMemory';
import { requireAuth } from '../../src/middleware/auth';
import { omegaMemoryService } from '../../src/services/omegaMemoryService';

// Mock dependencies
vi.mock('../../src/services/omegaMemoryService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/omega-memory', omegaMemoryRouter);

describe('Omega Memory Engine API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/omega-memory/ingest', () => {
    it('should ingest text and return entities, claims, relationships', async () => {
      const mockResult = {
        entities: [],
        claims: [],
        relationships: [],
        conflicts_detected: 0,
        suggestions: []
      };

      vi.mocked(omegaMemoryService.ingestText).mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/omega-memory/ingest')
        .send({ text: 'John is a good person', source: 'USER' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(omegaMemoryService.ingestText).toHaveBeenCalledWith(
        'user-123',
        'John is a good person',
        'USER'
      );
    });

    it('should return 400 if text is missing', async () => {
      const response = await request(app)
        .post('/api/omega-memory/ingest')
        .send({ source: 'USER' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/omega-memory/entities', () => {
    it('should return entities for user', async () => {
      const mockEntities = [
        {
          id: 'entity-1',
          user_id: 'user-123',
          type: 'PERSON',
          primary_name: 'John Doe',
          aliases: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(omegaMemoryService.getEntities).mockResolvedValue(mockEntities);

      const response = await request(app)
        .get('/api/omega-memory/entities')
        .expect(200);

      expect(response.body).toHaveProperty('entities');
      expect(response.body.entities).toEqual(mockEntities);
    });

    it('should filter by type if provided', async () => {
      vi.mocked(omegaMemoryService.getEntities).mockResolvedValue([]);

      await request(app)
        .get('/api/omega-memory/entities?type=PERSON')
        .expect(200);

      expect(omegaMemoryService.getEntities).toHaveBeenCalledWith('user-123', 'PERSON');
    });
  });

  describe('GET /api/omega-memory/entities/:id/claims', () => {
    it('should return claims for an entity', async () => {
      const mockClaims = [
        {
          id: 'claim-1',
          user_id: 'user-123',
          entity_id: 'entity-1',
          text: 'Test claim',
          source: 'USER',
          confidence: 0.8,
          start_time: new Date().toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(omegaMemoryService.getClaimsForEntity).mockResolvedValue(mockClaims);

      const response = await request(app)
        .get('/api/omega-memory/entities/entity-1/claims')
        .expect(200);

      expect(response.body).toHaveProperty('claims');
      expect(response.body.claims).toEqual(mockClaims);
    });
  });

  describe('GET /api/omega-memory/entities/:id/ranked-claims', () => {
    it('should return ranked claims for an entity', async () => {
      const mockRankedClaims = [
        {
          id: 'claim-1',
          user_id: 'user-123',
          entity_id: 'entity-1',
          text: 'Test claim',
          source: 'USER',
          confidence: 0.9,
          score: 0.85,
          evidence_count: 3,
          start_time: new Date().toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(omegaMemoryService.rankClaims).mockResolvedValue(mockRankedClaims);

      const response = await request(app)
        .get('/api/omega-memory/entities/entity-1/ranked-claims')
        .expect(200);

      expect(response.body).toHaveProperty('claims');
      expect(response.body.claims).toEqual(mockRankedClaims);
    });
  });

  describe('GET /api/omega-memory/entities/:id/summary', () => {
    it('should return entity summary', async () => {
      const mockSummary = {
        entity: {
          id: 'entity-1',
          user_id: 'user-123',
          type: 'PERSON',
          primary_name: 'John Doe',
          aliases: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        summary: 'Test summary',
        ranked_claims: [],
        active_relationships: []
      };

      vi.mocked(omegaMemoryService.summarizeEntity).mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/omega-memory/entities/entity-1/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
    });
  });

  describe('POST /api/omega-memory/claims/:id/evidence', () => {
    it('should add evidence to a claim', async () => {
      const mockEvidence = {
        id: 'evidence-1',
        user_id: 'user-123',
        claim_id: 'claim-1',
        content: 'Supporting evidence',
        source: 'journal_entry',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      vi.mocked(omegaMemoryService.addEvidence).mockResolvedValue(mockEvidence);

      const response = await request(app)
        .post('/api/omega-memory/claims/claim-1/evidence')
        .send({
          content: 'Supporting evidence',
          source: 'journal_entry'
        })
        .expect(200);

      expect(response.body).toHaveProperty('evidence');
      expect(response.body.evidence).toEqual(mockEvidence);
    });

    it('should return 400 if content or source is missing', async () => {
      const response = await request(app)
        .post('/api/omega-memory/claims/claim-1/evidence')
        .send({ content: 'Evidence' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});

