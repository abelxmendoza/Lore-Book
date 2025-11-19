import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

// Generate nonce for CSP
const generateNonce = (): string => {
  return crypto.randomBytes(16).toString('base64');
};

export const secureHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Generate nonce for this request
  const nonce = generateNonce();
  (req as any).nonce = nonce; // Attach to request for use in templates

  // Enhanced CSP with nonce support
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // Needed for Tailwind
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.openai.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ];

  if (process.env.NODE_ENV === 'development') {
    // Allow Vite HMR in development
    csp.push("connect-src 'self' ws://localhost:* http://localhost:* https://*.supabase.co https://api.openai.com");
    csp.push("script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}'");
  }

  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', csp.join('; '));
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('X-CSP-Nonce', nonce);
  
  next();
};
