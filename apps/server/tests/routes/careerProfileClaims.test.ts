import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { profileClaimsRouter } from '../../src/routes/profileClaims';
import { careerRouter } from '../../src/routes/career';
import { requireAuth } from '../../src/middleware/auth';
import { profileClaimsService } from '../../src/services/profileClaims/profileClaimsService';
import { careerSummaryService } from '../../src/services/career/careerSummaryService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/profileClaims/profileClaimsService');
vi.mock('../../src/services/career/careerSummaryService');

const claimsApp = express();
claimsApp.use(express.json());
claimsApp.use('/api/profile-claims', profileClaimsRouter);

const careerApp = express();
careerApp.use(express.json());
careerApp.use('/api/career', careerRouter);

describe('Profile Claims API', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET / lists claims with stats', async () => {
    vi.mocked(profileClaimsService.getClaims).mockResolvedValue([
      {
        id: 'c1',
        user_id: 'u1',
        claim_type: 'role',
        claim_text: 'Engineer at Acme',
        source: 'resume',
        source_id: null,
        source_detail: null,
        verified_status: 'unverified',
        confidence: 0.9,
        evidence: {},
        user_confirmed: false,
        user_confirmed_at: null,
        user_notes: null,
        metadata: {},
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    ] as any);

    const res = await request(claimsApp).get('/api/profile-claims?source=resume').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.claims).toHaveLength(1);
    expect(res.body.stats.unverified).toBe(1);
  });

  it('PATCH /:id confirms claim', async () => {
    vi.mocked(profileClaimsService.getClaim).mockResolvedValue({ id: 'c1' } as any);
    vi.mocked(profileClaimsService.confirmClaim).mockResolvedValue({
      id: 'c1',
      verified_status: 'verified',
      user_confirmed: true,
    } as any);

    const res = await request(claimsApp)
      .patch('/api/profile-claims/c1')
      .send({ action: 'confirm' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.claim.verified_status).toBe('verified');
    expect(profileClaimsService.confirmClaim).toHaveBeenCalledWith('u1', 'c1', undefined);
  });
});

describe('Career API', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /summary returns career summary', async () => {
    vi.mocked(careerSummaryService.getSummary).mockResolvedValue({
      generatedAt: new Date().toISOString(),
      hasResumeData: true,
      currentRole: { title: 'Dev', company: 'Acme' },
      contact: {},
      employment: [],
      education: [],
      employmentGaps: [],
      skills: [],
      employers: [],
      timeline: [],
      stats: {
        jobCount: 1,
        schoolCount: 0,
        skillCount: 0,
        employerCount: 0,
        unverifiedClaims: 0,
        resumeUploadCount: 1,
        timelineEventCount: 0,
      },
      latestResume: null,
    });

    const res = await request(careerApp).get('/api/career/summary').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.hasResumeData).toBe(true);
  });
});
