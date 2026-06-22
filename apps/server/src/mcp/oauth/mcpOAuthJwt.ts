import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { config } from '../../config';

type JwtPayload = Record<string, unknown>;

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function signMcpAccessToken(payload: {
  sub: string;
  clientId: string;
  scopes: string[];
  ttlSeconds?: number;
}): { token: string; expiresIn: number } {
  const secret = config.mcpOAuthJwtSecret;
  if (!secret) {
    throw new Error('MCP_OAUTH_JWT_SECRET is not configured');
  }

  const expiresIn = payload.ttlSeconds ?? config.mcpOAuthAccessTokenTtlSec;
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = {
    iss: config.mcpOAuthIssuer,
    sub: payload.sub,
    aud: config.mcpResourceAudience,
    client_id: payload.clientId,
    scope: payload.scopes.join(' '),
    iat: now,
    exp: now + expiresIn,
    typ: 'mcp+oauth',
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');

  return { token: `${signingInput}.${signature}`, expiresIn };
}

export type VerifiedMcpAccessToken = {
  sub: string;
  clientId: string;
  scopes: string[];
  exp: number;
};

export function verifyMcpAccessToken(token: string): VerifiedMcpAccessToken | null {
  const secret = config.mcpOAuthJwtSecret;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= now) return null;

  const aud = payload.aud;
  const audienceOk =
    aud === config.mcpResourceAudience ||
    (Array.isArray(aud) && aud.includes(config.mcpResourceAudience));
  if (!audienceOk) return null;

  if (payload.iss !== config.mcpOAuthIssuer) return null;

  const sub = String(payload.sub ?? '');
  const clientId = String(payload.client_id ?? payload.azp ?? '');
  if (!sub || !clientId) return null;

  const scopeRaw = String(payload.scope ?? 'memory:read');
  const scopes = scopeRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  return { sub, clientId, scopes, exp };
}

export function signPendingAuthorize(payload: Record<string, unknown>, ttlSeconds = 600): string {
  const secret = config.mcpOAuthJwtSecret;
  if (!secret) throw new Error('MCP_OAUTH_JWT_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, typ: 'mcp+oauth_pending', iat: now, exp: now + ttlSeconds };
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyPendingAuthorize(token: string): Record<string, unknown> | null {
  const secret = config.mcpOAuthJwtSecret;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expected = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.typ !== 'mcp+oauth_pending') return null;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const digest = createHash('sha256').update(codeVerifier).digest('base64url');
  return digest === codeChallenge;
}
