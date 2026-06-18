import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

import { createHealthRouter } from '../../src/routes/health';
import { evaluateOrigin, getAllowedCorsOrigins } from '../../src/utils/corsPolicy';

/**
 * Integration regression test for the 2026-06-18 production outage.
 *
 * Two symptoms were reported in the browser:
 *   1. `502 "Application failed to respond"` (root cause: port mismatch — covered
 *      by the smoke-health script + serverPort unit tests).
 *   2. `No 'Access-Control-Allow-Origin' header` from https://lorebookai.com.
 *
 * This test builds a minimal app wired with the SAME production CORS policy and
 * health route the real server uses, then asserts the edge-facing contract:
 *   - /api/health answers 200 with no auth
 *   - preflight + simple requests from lorebookai.com receive ACAO
 *   - unknown origins are rejected
 */
function buildTestApp() {
  const app = express();
  app.use(
    cors({
      origin: (origin, callback) => {
        const decision = evaluateOrigin(origin, process.env);
        if (decision.allowed) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID'],
      exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
    })
  );
  app.use(createHealthRouter(Date.now()));
  return app;
}

describe('server networking contract (outage regression)', () => {
  const app = buildTestApp();

  it('serves /api/health with 200 and no auth', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns Access-Control-Allow-Origin for the production site origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://lorebookai.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://lorebookai.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers CORS preflight (OPTIONS) for the production site origin', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://lorebookai.com')
      .set('Access-Control-Request-Method', 'GET');
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe('https://lorebookai.com');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('allows localhost dev origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects unknown third-party origins (no ACAO header)', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    // The cors middleware errors for disallowed origins → no ACAO header echoed.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps lorebookai.com on the allow-list regardless of env', () => {
    expect(getAllowedCorsOrigins({})).toContain('https://lorebookai.com');
  });
});
