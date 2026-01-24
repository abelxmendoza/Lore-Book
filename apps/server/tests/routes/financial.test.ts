import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/financial/financialEngine', () => ({
  FinancialEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      process: vi.fn().mockResolvedValue({
        transactions: [],
        spending: {},
        income: {},
        investments: {},
        score: {},
        mindset: [],
        insights: [],
      }),
    };
  }),
}));
vi.mock('../../src/services/financial/financialStorage', () => ({
  FinancialStorage: vi.fn().mockImplementation(function (this: unknown) {
    return {
      getTransactions: vi.fn().mockResolvedValue([]),
      saveTransactions: vi.fn().mockResolvedValue([]),
      saveSpendingPatterns: vi.fn().mockResolvedValue(undefined),
      saveIncomeTrend: vi.fn().mockResolvedValue(undefined),
      saveInvestmentProfile: vi.fn().mockResolvedValue(undefined),
      saveFinancialScore: vi.fn().mockResolvedValue(undefined),
      saveMindsetInsights: vi.fn().mockResolvedValue(undefined),
      saveInsights: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

import financialRouter from '../../src/routes/financial';

const app = express();
app.use(express.json());
app.use('/api/financial', financialRouter);

describe('Financial API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/financial/analyze').send({}).expect(200);
    expect(res.body).toHaveProperty('transactions');
  });

  it('GET /transactions returns transactions', async () => {
    const res = await request(app).get('/api/financial/transactions').expect(200);
    expect(res.body).toHaveProperty('transactions');
  });
});
