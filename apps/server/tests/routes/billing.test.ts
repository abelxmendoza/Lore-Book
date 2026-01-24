import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

const mockStripe = {
  checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: 'https://checkout.example.com' }) } },
  billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: 'https://portal.example.com' }) } },
};

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/billing/stripeClient', () => ({
  ensureStripe: () => mockStripe,
}));

import { billingRouter } from '../../src/billing/billingRouter';

const app = express();
app.use(express.json());
app.use('/api/billing', billingRouter);

describe('Billing API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /pricing returns pricing table', async () => {
    const res = await request(app).get('/api/billing/pricing').expect(200);
    expect(res.body).toHaveProperty('free');
    expect(res.body).toHaveProperty('premium');
    expect(res.body).toHaveProperty('founder');
  });

  it('POST /create-checkout-session returns url', async () => {
    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ tier: 'premium' })
      .expect(200);
    expect(res.body).toHaveProperty('url', 'https://checkout.example.com');
  });

  it('POST /create-checkout-session returns 400 for invalid tier', async () => {
    await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ tier: 'invalid' })
      .expect(400);
  });

  it('POST /portal returns url', async () => {
    const res = await request(app)
      .post('/api/billing/portal')
      .send({ customerId: 'cus_1' })
      .expect(200);
    expect(res.body).toHaveProperty('url', 'https://portal.example.com');
  });

  it('POST /webhook returns received', async () => {
    const res = await request(app).post('/api/billing/webhook').send({}).expect(200);
    expect(res.body).toEqual({ received: true });
  });
});
