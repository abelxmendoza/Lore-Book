import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'u1' };
    next();
  }),
}));
vi.mock('../../src/services/biasDetection/biasDetectionService', () => ({
  biasDetectionService: {
    getBiasesForEntry: vi.fn().mockResolvedValue([]),
    getUserBiases: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/ethicsReview/ethicsReviewService', () => ({
  ethicsReviewService: {
    getReviewForEntry: vi.fn().mockResolvedValue(null),
    getPendingReviews: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/consentTracking/consentTrackingService', () => ({
  consentTrackingService: {
    getUserConsents: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../src/services/memoryReliability/memoryReliabilityService', () => ({
  memoryReliabilityService: { getReliabilityScore: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../src/services/contextPrompting/contextPromptingService', () => ({
  contextPromptingService: { getPromptForEntry: vi.fn().mockResolvedValue(null), getPendingPrompts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/meaningEmergence/meaningEmergenceService', () => ({
  meaningEmergenceService: { getHighSignificanceEntries: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/moodBiasCorrection/moodBiasCorrectionService', () => ({
  moodBiasCorrectionService: { analyzeMoodBias: vi.fn().mockResolvedValue({}), getMoodDistribution: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../src/services/signalNoiseAnalysis/signalNoiseAnalysisService', () => ({
  signalNoiseAnalysisService: { analyzeSignalNoise: vi.fn().mockResolvedValue({}), extractThemesWithTimeSpan: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));

import biasEthicsRouter from '../../src/routes/biasEthics';

const app = express();
app.use(express.json());
app.use('/api/bias-ethics', biasEthicsRouter);

describe('BiasEthics API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /bias returns biases', async () => {
    const res = await request(app).get('/api/bias-ethics/bias').expect(200);
    expect(res.body).toHaveProperty('biases');
  });

  it('GET /bias/:entryId returns biases for entry', async () => {
    const res = await request(app).get('/api/bias-ethics/bias/entry-1').expect(200);
    expect(res.body).toHaveProperty('biases');
  });

  it('GET /ethics/pending returns reviews', async () => {
    const res = await request(app).get('/api/bias-ethics/ethics/pending').expect(200);
    expect(res.body).toHaveProperty('reviews');
  });

  it('GET /mood-bias returns analysis', async () => {
    const res = await request(app).get('/api/bias-ethics/mood-bias').expect(200);
    expect(res.body).toHaveProperty('analysis');
  });
});
