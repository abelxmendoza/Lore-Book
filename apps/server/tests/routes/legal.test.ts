import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';

vi.mock('../../src/middleware/rateLimit', () => ({
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { legalRouter } from '../../src/routes/legal';
import { renderLegalHtml } from '../../src/lib/legalHtml';

const app = express();
app.use('/api/legal', legalRouter);

let origCwd: string;

describe('Legal API Routes', () => {
  beforeAll(() => {
    origCwd = process.cwd();
    process.chdir(path.join(__dirname, '..', '..'));
  });

  afterAll(() => {
    process.chdir(origCwd);
  });

  it('GET /terms returns HTML by default', async () => {
    const res = await request(app).get('/api/legal/terms').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('LoreBook Terms of Service');
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('GET /privacy returns HTML by default', async () => {
    const res = await request(app).get('/api/legal/privacy').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('LoreBook Privacy Policy');
  });

  it('GET /terms?format=md returns markdown', async () => {
    const res = await request(app).get('/api/legal/terms?format=md').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/markdown/);
    expect(res.text).toContain('# LoreBook Terms of Service');
  });
});

describe('renderLegalHtml', () => {
  it('renders headings, links, and tables', () => {
    const html = renderLegalHtml('Test', '# Title\n\n## Section\n\n- item\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<li>item</li>');
    expect(html).toContain('<table>');
  });
});
