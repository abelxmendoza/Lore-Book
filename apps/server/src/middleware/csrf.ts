import crypto from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';

import { logSecurityEvent } from '../services/securityLog';

// Store CSRF tokens in memory. This is sufficient for the current single-instance deployment.
const tokenStore = new Map<string, { token: string; expiresAt: number }>();

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Generate a new CSRF token
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// SECURITY: Properly detect production environment
const isDevelopment = () => process.env.NODE_ENV === 'development' || 
                      process.env.NODE_ENV === 'test' ||
                      (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');
const isProduction = () => process.env.NODE_ENV === 'production' || 
                     process.env.API_ENV === 'production';

type CsrfRecord = { token: string; expiresAt: number };

const getStoredToken = (sessionId: string): CsrfRecord | null => {
  return tokenStore.get(sessionId) ?? null;
};

const setStoredToken = (sessionId: string, record: CsrfRecord): void => {
  tokenStore.set(sessionId, record);
};

const deleteStoredToken = (sessionId: string): void => {
  tokenStore.delete(sessionId);
};

const getOrCreateCsrfToken = (sessionId: string): string => {
  const existing = getStoredToken(sessionId);
  if (existing && Date.now() <= existing.expiresAt) {
    return existing.token;
  }
  const token = generateCsrfToken();
  setStoredToken(sessionId, { token, expiresAt: Date.now() + TOKEN_EXPIRY_MS });
  return token;
};

export const csrfTokenMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF in development mode
  if (isDevelopment()) {
    return next();
  }

  // Only apply CSRF to state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for public endpoints
  const publicPaths = ['/api/health', '/api/auth'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const sessionId = (req as any).user?.id || req.ip || 'anonymous';
  const stored = getStoredToken(sessionId);

  // Generate new token if expired or missing
  if (!stored || Date.now() > stored.expiresAt) {
    const token = generateCsrfToken();
    setStoredToken(sessionId, {
      token,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS
    });
    
    // Set cookie (only in production, requires cookie-parser)
    if (!isDevelopment() && typeof res.cookie === 'function') {
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: TOKEN_EXPIRY_MS
      });
    }
    
    // Always set in response header for SPA
    res.setHeader('X-CSRF-Token', token);
  } else {
    res.setHeader('X-CSRF-Token', stored.token);
  }

  next();
};

// Middleware to validate CSRF token
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF in development mode
  if (isDevelopment()) {
    return next();
  }

  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for public endpoints
  const publicPaths = ['/api/health', '/api/auth'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  const sessionId = (req as any).user?.id || req.ip || 'anonymous';
  const stored = getStoredToken(sessionId);
  
  if (!stored) {
    logSecurityEvent('csrf_token_missing', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Check if token expired
  if (Date.now() > stored.expiresAt) {
    deleteStoredToken(sessionId);
    logSecurityEvent('csrf_token_expired', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(403).json({ error: 'CSRF token expired' });
  }

  // Get token from header or cookie
  const headerToken = req.headers[CSRF_TOKEN_HEADER] as string;
  const cookieToken = (req as any).cookies?.[CSRF_COOKIE_NAME];

  if (!headerToken && !cookieToken) {
    logSecurityEvent('csrf_token_not_provided', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(403).json({ error: 'CSRF token required' });
  }

  const providedToken = headerToken || cookieToken;
  
  if (providedToken !== stored.token) {
    logSecurityEvent('csrf_token_mismatch', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      tokenPreview: providedToken?.substring(0, 8)
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

/**
 * Returns a valid CSRF token for the given userId, creating one if needed.
 * Used by GET /api/security/csrf-token so the frontend can pre-fetch a token
 * before its first mutating request.
 */
export const createCsrfTokenForUser = (userId: string): string => {
  return getOrCreateCsrfToken(userId);
};

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of tokenStore.entries()) {
    if (now > data.expiresAt) {
      tokenStore.delete(sessionId);
    }
  }
}, 60 * 1000); // Every minute
