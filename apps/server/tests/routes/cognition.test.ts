import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/cognition', () => ({
  listGraphNodes: vi.fn(),
  listEdgesFromNode: vi.fn(),
  getEvidenceForTarget: vi.fn(),
  salienceService: {
    getTop: vi.fn(),
    recompute: vi.fn(),
  },
}));
vi.mock('../../src/services/narrativeSpine', () => ({
  getProvenanceByClaimId: vi.fn(),
  getProvenanceBySource: vi.fn(),
}));
vi.mock('../../src/services/narrative/history', () => ({
  historyEngineService: { compile: vi.fn() },
  compileLifeHistory: vi.fn(),
}));
vi.mock('../../src/services/narrative/narrativeCompilerService', () => ({
  compileNarrativeIR: vi.fn(),
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import {
  listGraphNodes,
  listEdgesFromNode,
  getEvidenceForTarget,
  salienceService,
} from '../../src/services/cognition';
import { getProvenanceByClaimId, getProvenanceBySource } from '../../src/services/narrativeSpine';
import { historyEngineService, compileLifeHistory } from '../../src/services/narrative/history';
import { compileNarrativeIR } from '../../src/services/narrative/narrativeCompilerService';
import { cognitionRouter } from '../../src/routes/cognition';

const app = express();
app.use(express.json());
app.use('/api/cognition', cognitionRouter);

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const NODE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const EVENT_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const CLAIM_ID = 'cccccccc-dddd-4eee-8fff-000000000001';

describe('Cognition API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as { user?: { id: string } }).user = { id: USER_ID };
      next();
    });
  });

  it('GET /graph/nodes returns nodes with valid kind filter', async () => {
    vi.mocked(listGraphNodes).mockResolvedValue([
      { id: NODE_ID, node_kind: 'event', display_name: 'Graduation' } as never,
    ]);

    const res = await request(app).get('/api/cognition/graph/nodes?kind=event&limit=10').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.nodes).toHaveLength(1);
    expect(listGraphNodes).toHaveBeenCalledWith(USER_ID, { nodeKind: 'event', limit: 10 });
  });

  it('GET /graph/nodes rejects invalid kind', async () => {
    await request(app).get('/api/cognition/graph/nodes?kind=invalid_kind').expect(400);
    expect(listGraphNodes).not.toHaveBeenCalled();
  });

  it('GET /graph/edges/:nodeId rejects non-UUID', async () => {
    await request(app).get('/api/cognition/graph/edges/not-a-uuid').expect(400);
    expect(listEdgesFromNode).not.toHaveBeenCalled();
  });

  it('GET /graph/edges/:nodeId returns edges for valid UUID', async () => {
    vi.mocked(listEdgesFromNode).mockResolvedValue([]);
    await request(app).get(`/api/cognition/graph/edges/${NODE_ID}`).expect(200);
    expect(listEdgesFromNode).toHaveBeenCalledWith(USER_ID, NODE_ID);
  });

  it('GET /assertions/:kind/:id/provenance returns 404 for missing claim', async () => {
    vi.mocked(getProvenanceByClaimId).mockResolvedValue(null);
    await request(app)
      .get(`/api/cognition/assertions/narrative_claim/${CLAIM_ID}/provenance`)
      .expect(404);
  });

  it('GET /assertions/:kind/:id/provenance rejects invalid targetKind', async () => {
    await request(app)
      .get(`/api/cognition/assertions/unknown/${CLAIM_ID}/provenance`)
      .expect(400);
  });

  it('GET /assertions/node/:id/provenance returns evidence bundle', async () => {
    vi.mocked(getEvidenceForTarget).mockResolvedValue([{ evidence_kind: 'characters' } as never]);
    const res = await request(app)
      .get(`/api/cognition/assertions/node/${NODE_ID}/provenance`)
      .expect(200);
    expect(res.body.evidence).toHaveLength(1);
  });

  it('GET /salience clamps invalid limit to default', async () => {
    vi.mocked(salienceService.getTop).mockResolvedValue([]);
    await request(app).get('/api/cognition/salience?limit=-99').expect(200);
    expect(salienceService.getTop).toHaveBeenCalledWith(USER_ID, 20);
  });

  it('POST /salience/recompute returns count', async () => {
    vi.mocked(salienceService.recompute).mockResolvedValue(42);
    const res = await request(app).post('/api/cognition/salience/recompute').expect(200);
    expect(res.body.count).toBe(42);
  });

  it('GET /causal-chain/:eventId rejects invalid UUID', async () => {
    await request(app).get('/api/cognition/causal-chain/not-valid').expect(400);
  });

  it('GET /causal-chain/:eventId returns provenance and links', async () => {
    vi.mocked(getProvenanceBySource).mockResolvedValue({ claim: { id: CLAIM_ID } } as never);
    const res = await request(app).get(`/api/cognition/causal-chain/${EVENT_ID}`).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.eventId).toBe(EVENT_ID);
  });

  it('GET /autobiography-outline composes outline', async () => {
    vi.mocked(compileNarrativeIR).mockResolvedValue({
      currentChapter: { label: 'Rebuild' },
      evidence: [{ source: 'narrative' }, { source: 'other' }],
    } as never);
    vi.mocked(compileLifeHistory).mockResolvedValue({
      chapters: [{ themes: ['career'] }],
      turningPoints: [{ id: 'tp-1' }],
    } as never);

    const res = await request(app).get('/api/cognition/autobiography-outline').expect(200);
    expect(res.body.outline.mode).toBe('autobiography');
    expect(res.body.outline.themes).toContain('career');
    expect(res.body.outline.interpretationClaims).toHaveLength(1);
  });
});
