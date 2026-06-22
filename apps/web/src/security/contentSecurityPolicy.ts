/**
 * Canonical production web CSP — keep in sync with apps/web/vercel.json headers.
 * Not applied on the Vite dev server (HMR needs relaxed script/connect rules).
 * @see https://docs.stripe.com/security/guide#content-security-policy
 */
export const WEB_CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  // Stripe Clover loads sub-scripts from js.stripe.com and m.stripe.network
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://m.stripe.network",
  "script-src-elem 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://m.stripe.network",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com https://js.stripe.com https://m.stripe.network https://*.stripe.com",
  "img-src 'self' data: blob: https: https://*.stripe.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://supabase.lorebookai.com wss://supabase.lorebookai.com https://api.openai.com https://*.sentry.io https://*.ingest.us.sentry.io https://lore-book-production.up.railway.app https://api.stripe.com https://js.stripe.com https://*.js.stripe.com https://m.stripe.network https://*.stripe.com",
  "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://m.stripe.network https://m.stripe.com https://vercel.live",
  "worker-src 'self' blob: https://m.stripe.network",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
] as const;

export const WEB_CONTENT_SECURITY_POLICY = WEB_CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ');
