import { createSupabaseContext, type AuthModeWithKey, type SupabaseContext } from '@supabase/server';
import type { Request as ExpressRequest } from 'express';

import { config } from '../config';

type CreateContextOptions = {
  auth?: AuthModeWithKey | AuthModeWithKey[];
};

function headersFromExpress(req: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

function requestUrl(req: ExpressRequest): string {
  const proto = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  return `${proto}://${host}${req.originalUrl || req.url}`;
}

function supabaseServerEnv() {
  const publishableKey = config.supabasePublishableKey || config.supabaseAnonKey;
  const secretKey = config.supabaseSecretKey || config.supabaseServiceRoleKey;
  const publishableKeys: Record<string, string> = {};
  const secretKeys: Record<string, string> = {};
  const jwks =
    process.env.SUPABASE_JWKS ||
    config.supabaseJwksUrl ||
    (config.supabaseUrl ? `${config.supabaseUrl}/auth/v1/.well-known/jwks.json` : undefined);

  if (publishableKey) publishableKeys.default = publishableKey;
  if (secretKey) secretKeys.default = secretKey;

  return {
    url: config.supabaseUrl,
    publishableKeys,
    secretKeys,
    jwks: jwks ? new URL(jwks) : null,
  };
}

export async function createSupabaseServerContext<Database = unknown>(
  req: ExpressRequest,
  options: CreateContextOptions = {}
): Promise<
  | { data: SupabaseContext<Database>; error: null }
  | { data: null; error: { message: string; code: string; status: number } }
> {
  const request = new Request(requestUrl(req), {
    method: req.method,
    headers: headersFromExpress(req),
  });

  return createSupabaseContext<Database>(request, {
    auth: options.auth ?? 'user',
    env: supabaseServerEnv(),
    cors: false,
  });
}
