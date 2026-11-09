import { createHash } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import { isDevelopmentRuntime } from '../config/runtimePolicy';
import { createServerSupabaseClient } from '../lib/createServerSupabaseClient';
import type { AuthUser } from '../types/runtime/express';

import { MCP_SESSION_CLIENT_ID, MCP_SESSION_TOKEN_SCOPES } from './mcpScopes';
import type { McpAuthContext } from './types';
import { verifyMcpAccessToken } from './oauth/mcpOAuthJwt';

declare global {
  namespace Express {
    interface Request {
      mcpContext?: McpAuthContext;
    }
  }
}

let supabase: ReturnType<typeof createServerSupabaseClient> | null = null;
try {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    supabase = createServerSupabaseClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  }
} catch {
  supabase = null;
}

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function devBypassUser(): AuthUser | null {
  if (!isDevelopmentRuntime() || process.env.DISABLE_AUTH_FOR_DEV !== 'true') return null;
  return {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'dev@example.com',
    lastSignInAt: new Date().toISOString(),
    fullName: null,
  };
}

export type McpBearerAuthResult = {
  user: AuthUser;
  clientId?: string;
  scopes?: string[];
};

export async function authenticateMcpBearer(token: string): Promise<McpBearerAuthResult | null> {
  const devUser = devBypassUser();
  if (devUser && token === 'dev') {
    return {
      user: devUser,
      clientId: 'lorebook-dev',
      scopes: ['memory:read', 'memory:write', 'entity:write'],
    };
  }

  const oauth = verifyMcpAccessToken(token);
  if (oauth) {
    return {
      user: { id: oauth.sub },
      clientId: oauth.clientId,
      scopes: oauth.scopes,
    };
  }

  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  const metadata = (data.user as { user_metadata?: { full_name?: string; name?: string } }).user_metadata;
  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? undefined,
      lastSignInAt: (data.user as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
      fullName: metadata?.full_name ?? metadata?.name ?? null,
    },
    // Supabase session JWTs carry no OAuth grant. Their MCP scopes and
    // client identity are fixed server-side (read-only; see mcpScopes.ts)
    // — never taken from caller-supplied headers.
    clientId: MCP_SESSION_CLIENT_ID,
    scopes: [...MCP_SESSION_TOKEN_SCOPES],
  };
}

export async function mcpAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const devUser = devBypassUser();
    if (devUser && !req.headers.authorization) {
      req.user = devUser;
      req.mcpContext = {
        user: devUser,
        clientId: 'lorebook-dev',
        requestId: req.requestId ?? `mcp-${Date.now()}`,
        scopes: ['memory:read', 'memory:write', 'entity:write'],
        ipHash: hashIp(req.ip),
      };
      return next();
    }

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const authResult = await authenticateMcpBearer(token);
    if (!authResult) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    req.user = authResult.user;
    // Scopes and client identity come only from the verified token
    // (OAuth grant, dev bypass, or the fixed session-token set). Caller
    // headers such as x-mcp-scopes / x-mcp-client-id are never trusted:
    // they let any session holder assert write scopes for itself.
    const scopes = authResult.scopes ?? [...MCP_SESSION_TOKEN_SCOPES];

    req.mcpContext = {
      user: authResult.user,
      clientId: authResult.clientId || MCP_SESSION_CLIENT_ID,
      requestId: req.requestId ?? `mcp-${Date.now()}`,
      scopes,
      ipHash: hashIp(req.ip),
    };

    if (!req.mcpContext.scopes.includes('memory:read')) {
      res.status(403).json({ error: 'Insufficient scope: memory:read required' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
}
