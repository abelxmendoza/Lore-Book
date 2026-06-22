import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

import {
  buildDbHealthPayload,
  buildHealthPayload,
  createHealthRouter,
  resolveDbHealthStatus,
} from '../../src/routes/health';

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

describe('resolveDbHealthStatus', () => {
  it('prioritizes schema degradation over storage warnings', () => {
    expect(resolveDbHealthStatus(false, 'warn')).toBe('degraded');
    expect(resolveDbHealthStatus(true, 'critical')).toBe('critical');
    expect(resolveDbHealthStatus(true, 'ok', 'warn')).toBe('warn');
    expect(resolveDbHealthStatus(true, 'ok')).toBe('ok');
  });
});

describe('buildDbHealthPayload', () => {
  it('merges schema, storage, upgrade, and connection into one payload', async () => {
    const payload = await buildDbHealthPayload({
      verifySchema: async () => ({ ok: true, missingTables: [] }),
      getLastSchemaCheck: () => new Date('2026-06-18T00:00:00.000Z'),
      probeDatabaseOps: async () => ({
        storage: {
          status: 'warn',
          databaseBytes: 420_000_000,
          walBytes: 12_000_000,
          quotaBytes: 524_288_000,
          utilizationRatio: 0.8,
          checkedAt: '2026-06-18T12:00:00.000Z',
        },
        upgrade: {
          status: 'ok',
          postgresVersion: '15.8',
          postgresMajor: 15,
          cronJobRunDetailsRows: 0,
          deprecatedExtensions: [],
          enabledExtensions: [{ name: 'vector', schema: 'extensions', version: '0.8.0' }],
          warnings: [],
        },
      }),
      resolveDatabaseConnectionHints: () => ({
        databaseUrlConfigured: true,
        sslMode: 'require',
        sslEnforcementReady: true,
      }),
    });

    expect(payload.status).toBe('warn');
    expect(payload.missingTables).toEqual([]);
    expect(payload.storage.databaseBytes).toBe(420_000_000);
    expect(payload.upgrade.postgresMajor).toBe(15);
    expect(payload.connection.sslEnforcementReady).toBe(true);
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
    await request(app).get('/api/health').expect(200);
  });

  it('returns db health with storage, upgrade, and connection snapshots', async () => {
    const res = await request(app).get('/api/health/db').expect(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('missingTables');
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('upgrade');
    expect(res.body).toHaveProperty('connection');
    expect(res.body.storage).toHaveProperty('quotaBytes');
  });
});

