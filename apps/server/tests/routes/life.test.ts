import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/lifeStoryApiService', () => ({
  lifeStoryApiService: {
    getLifeArcsResponse: vi.fn(),
    getCurrentChapterResponse: vi.fn(),
    getLifeConflictsResponse: vi.fn(),
    getLifeMomentumResponse: vi.fn(),
  },
}));

import { requireAuth } from '../../src/middleware/auth';
import { lifeStoryApiService } from '../../src/services/lifeStoryApiService';
import { lifeRouter } from '../../src/routes/life';

const app = express();
app.use(express.json());
app.use('/api/life', lifeRouter);

const mockArc = {
  id: 'signal:family_arc',
  title: 'Family Arc',
  category: 'family' as const,
  momentum: 'growing' as const,
  score: 40,
  evidence: ['9 recent mentions (30d)'],
  sources: ['episodes'],
  provenance: {
    evidenceCount: 3,
    episodes: [{ id: 'j1', label: 'Family dinner', date: '2026-06-01' }],
    goals: [],
    projects: [{ id: 'o1', label: 'Family' }],
    relationships: [],
    events: [],
    confidence: 0.89,
  },
  startDate: '2026-05-01',
  latestActivity: '2026-06-01',
};

describe('Life Story API Routes', () => {
  const mockUser = { id: 'user-123', email: 'founder@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /arcs returns arcs with provenance', async () => {
    vi.mocked(lifeStoryApiService.getLifeArcsResponse).mockResolvedValue({
      success: true,
      generatedAt: '2026-06-16T00:00:00.000Z',
      arcs: [mockArc],
      signalInventory: { family: 38 } as any,
      lifeDirection: { movingToward: ['Family Arc (family)'], gainingMomentum: ['Family Arc'], fading: [], deservesAttention: [] },
    });

    const res = await request(app).get('/api/life/arcs').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.arcs[0].provenance.evidenceCount).toBe(3);
    expect(lifeStoryApiService.getLifeArcsResponse).toHaveBeenCalledWith('user-123');
  });

  it('GET /current-chapter returns narrative and provenance', async () => {
    vi.mocked(lifeStoryApiService.getCurrentChapterResponse).mockResolvedValue({
      success: true,
      generatedAt: '2026-06-16T00:00:00.000Z',
      chapter: {
        label: 'Family momentum.',
        narrative: 'Family momentum.',
        evidence: ['9 recent mentions (30d)'],
        provenance: mockArc.provenance,
        dominantArcs: [{ id: mockArc.id, title: mockArc.title, momentum: 'growing', confidence: 0.89 }],
      },
    });

    const res = await request(app).get('/api/life/current-chapter').expect(200);
    expect(res.body.chapter.narrative).toContain('Family');
    expect(res.body.chapter.provenance.confidence).toBeGreaterThan(0);
  });

  it('GET /conflicts returns conflicts with provenance', async () => {
    vi.mocked(lifeStoryApiService.getLifeConflictsResponse).mockResolvedValue({
      success: true,
      generatedAt: '2026-06-16T00:00:00.000Z',
      conflicts: [
        {
          kind: 'project',
          label: 'LoreBook build vs employment transition (Amazon)',
          evidence: ['LoreBook Arc', 'Amazon Arc'],
          severity: 'high',
          provenance: { evidenceCount: 2, goals: [], projects: [], relationships: [], confidence: 0.7 },
        },
      ],
    });

    const res = await request(app).get('/api/life/conflicts').expect(200);
    expect(res.body.conflicts[0].severity).toBe('high');
    expect(res.body.conflicts[0].provenance).toBeDefined();
  });

  it('GET /momentum returns items and summary', async () => {
    vi.mocked(lifeStoryApiService.getLifeMomentumResponse).mockResolvedValue({
      success: true,
      generatedAt: '2026-06-16T00:00:00.000Z',
      items: [
        {
          id: mockArc.id,
          title: mockArc.title,
          category: 'family',
          momentum: 'growing',
          score: 40,
          confidence: 0.89,
          evidenceCount: 3,
          latestActivity: '2026-06-01',
          evidence: mockArc.evidence,
        },
      ],
      summary: { emerging: 0, growing: 1, stable: 0, declining: 0, completed: 0 },
    });

    const res = await request(app).get('/api/life/momentum').expect(200);
    expect(res.body.items[0].momentum).toBe('growing');
    expect(res.body.summary.growing).toBe(1);
  });
});
