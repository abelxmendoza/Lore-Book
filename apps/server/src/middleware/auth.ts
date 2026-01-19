import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import { logSecurityEvent, redactSensitive } from '../services/securityLog';

// Only create Supabase client if config is available
let supabase: ReturnType<typeof createClient> | null = null;
try {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }
} catch (error) {
  // Supabase client creation failed, will use dev mode
  console.warn('Failed to create Supabase client:', error);
}

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email?: string;
    lastSignInAt?: string | null;
  };
};

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // SECURITY: Only disable auth in development mode, NEVER in production
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                          process.env.API_ENV === 'dev';
    const allowDevBypass = isDevelopment && process.env.DISABLE_AUTH_FOR_DEV === 'true';
    
    if (allowDevBypass) {
      // Only allow dev bypass if explicitly enabled via environment variable
      // This prevents accidental exposure in production
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        email: 'dev@example.com',
        lastSignInAt: new Date().toISOString()
      };
      return next();
    }
    
    if (req.user) {
      return next();
    }

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.replace('Bearer ', '')
      : header || undefined;

    if (!token) {
      logSecurityEvent('auth_missing', {
        ip: req.ip,
        path: req.path,
        userAgent: req.headers['user-agent']
      });
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Authentication service not configured' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      logSecurityEvent('invalid_token', {
        ip: req.ip,
        path: req.path,
        reason: error?.message ?? 'No user for token',
        tokenPreview: redactSensitive(token)
      });
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? undefined,
      lastSignInAt: (data.user as any)?.last_sign_in_at ?? null
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireAuth = authMiddleware;
