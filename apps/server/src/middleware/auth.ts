import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email?: string;
  };
};

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = header.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  req.user = { id: data.user.id, email: data.user.email ?? undefined };
  next();
};
