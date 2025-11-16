import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

import { config } from '../config';
import { logSecurityEvent, redactSensitive } from '../services/securityLog';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

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
};

export const requireAuth = authMiddleware;
