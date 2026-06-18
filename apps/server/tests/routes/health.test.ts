import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

import { buildHealthPayload, createHealthRouter } from '../../src/routes/health';

describe('buildHealthPayload', () => {
  it('reports ok status and a non-negative uptime', () => {
    const start = 1_000_000;
    const now = start + 12_000;
    const payload = buildHealthPayload(start, {}, now);
    expect(payload.status).toBe('ok');
    expect(payload.uptimeSeconds).toBe(12);
  });

  it('never reports negative uptime even if clocks skew', () => {
    const payload = buildHealthPayload(2_000_000, {}, 1_000_000);
    expect(payload.uptimeSeconds).toBe(0);
  });

  it('surfaces the resolved port and env presence flags', () => {
    const payload = buildHealthPayload(0, {
      PORT: '8080',
      SUPABASE_URL: 'https://x.supabase.co',
      OPENAI_API_KEY: 'sk-x',
    });
    expect(payload.port).toBe(8080);
    expect(payload.envPresent.SUPABASE_URL).toBe(true);
    expect(payload.envPresent.OPENAI_API_KEY).toBe(true);
    expect(payload.envPresent.STRIPE_SECRET_KEY).toBe(false);
  });

  it('reports a null port when PORT is unset/invalid', () => {
    expect(buildHealthPayload(0, {}).port).toBeNull();
    expect(buildHealthPayload(0, { PORT: 'abc' }).port).toBeNull();
  });

  it('defaults deploymentEnv to "unknown"', () => {
    expect(buildHealthPayload(0, {}).deploymentEnv).toBe('unknown');
    expect(buildHealthPayload(0, { NODE_ENV: 'production' }).deploymentEnv).toBe('production');
  });
});

describe('GET /api/health (router)', () => {
  const app = express();
  app.use(createHealthRouter(Date.now()));

  it('returns 200 with the health contract', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('envPresent');
  });

  it('requires no auth and no body', async () => {
    // No Authorization header set — must still answer 200.
    await request(app).get('/api/health').expect(200);
  });
});
