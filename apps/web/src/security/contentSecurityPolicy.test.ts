import { describe, it, expect } from 'vitest';
import { WEB_CONTENT_SECURITY_POLICY } from './contentSecurityPolicy';

describe('contentSecurityPolicy', () => {
  it('allows Stripe.js fonts, frames, and API calls', () => {
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('font-src');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://js.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://api.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://*.js.stripe.com');
    expect(WEB_CONTENT_SECURITY_POLICY).toContain('https://m.stripe.network');
  });
});
