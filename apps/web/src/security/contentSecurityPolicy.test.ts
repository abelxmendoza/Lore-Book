import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WEB_CONTENT_SECURITY_POLICY } from './contentSecurityPolicy';

function normalizeCsp(value: string): string {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join('; ');
}

describe('contentSecurityPolicy', () => {
  it('allows Stripe.js scripts, fonts, frames, workers, and API calls', () => {
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('font-src');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://js.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://api.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://*.js.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://m.stripe.network');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('worker-src');
  });

  it('matches vercel.json Content-Security-Policy header', () => {
    const vercelJsonPath = resolve(process.cwd(), 'vercel.json');
    const vercelConfig = JSON.parse(readFileSync(vercelJsonPath, 'utf8')) as {
      headers?: Array<{ source: string; headers?: Array<{ key: string; value: string }> }>;
    };
    const globalHeaders = vercelConfig.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? [];
    const cspHeader = globalHeaders.find((header) => header.key === 'Content-Security-Policy');
    expect(cspHeader?.value).toBeDefined();
    expect(normalizeCsp(cspHeader!.value)).toBe(normalizeCsp(WEB_CONTENT_SECURITY_POLICY));
  });
});
