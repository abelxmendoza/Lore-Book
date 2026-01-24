import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import diagnosticsRouter from '../../src/routes/diagnostics';

vi.mock('../../src/config', () => ({
  config: {
    port: 4000,
    supabaseUrl: 'http://test',
    openAiKey: 'test-key',
    supabaseServiceRoleKey: 'test-role',
  },
}));

const app = express();
app.use('/api/diagnostics', diagnosticsRouter);

describe('Diagnostics API Routes', () => {
  describe('GET /api/diagnostics', () => {
    it('should return diagnostic info', async () => {
      const response = await request(app).get('/api/diagnostics').expect(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('server');
      expect(response.body).toHaveProperty('security');
      expect(response.body).toHaveProperty('request');
    });
  });

  describe('GET /api/diagnostics/cors', () => {
    it('should return CORS diagnostic', async () => {
      const response = await request(app).get('/api/diagnostics/cors').expect(200);
      expect(response.body).toHaveProperty('allowedOrigins');
      expect(response.body).toHaveProperty('isAllowed');
      expect(response.body).toHaveProperty('message');
      // origin is omitted when req.headers.origin is undefined (JSON drops undefined)
      if (response.body.origin !== undefined) {
        expect(typeof response.body.origin).toBe('string');
      }
    });
  });
});
