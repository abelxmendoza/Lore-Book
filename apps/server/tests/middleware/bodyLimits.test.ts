import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createJsonBodyParser } from '../../src/middleware/bodyLimits';
import { errorHandler } from '../../src/middleware/errorHandler';

function buildApp(isDevelopment: boolean) {
  const app = express();
  app.use(createJsonBodyParser(isDevelopment));
  app.post('/api/chat/stream', (req, res) => {
    res.json({ ok: true, imageChars: req.body?.images?.[0]?.dataUrl?.length ?? 0 });
  });
  app.post('/api/chat', (_req, res) => res.json({ ok: true }));
  app.post('/api/other', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

const dataUrl = (chars: number) => `data:image/jpeg;base64,${'A'.repeat(chars)}`;

describe('createJsonBodyParser', () => {
  it('accepts a multi-photo chat/stream body larger than 1mb in production mode', async () => {
    const app = buildApp(false);
    // ~8MB body — two near-max compressed photos.
    const body = { message: 'photos', images: [{ dataUrl: dataUrl(4_000_000) }, { dataUrl: dataUrl(4_000_000) }] };
    const res = await request(app).post('/api/chat/stream').send(body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.imageChars).toBeGreaterThan(4_000_000);
  });

  it('accepts a large body on POST /api/chat in production mode', async () => {
    const app = buildApp(false);
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'photo', images: [{ dataUrl: dataUrl(3_000_000) }] });
    expect(res.status).toBe(200);
  });

  it('still rejects >1mb bodies on other routes in production mode with a clean 413', async () => {
    const app = buildApp(false);
    const res = await request(app).post('/api/other').send({ data: 'x'.repeat(1_500_000) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Request too large');
    expect(res.body.message).toContain('too large');
  });

  it('rejects chat bodies above the chat vision ceiling with a 413', async () => {
    const app = buildApp(false);
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'huge', images: [{ dataUrl: dataUrl(28_000_000) }] });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Request too large');
  });

  it('keeps the permissive limit everywhere in development mode', async () => {
    const app = buildApp(true);
    const res = await request(app).post('/api/other').send({ data: 'x'.repeat(2_000_000) });
    expect(res.status).toBe(200);
  });
});
