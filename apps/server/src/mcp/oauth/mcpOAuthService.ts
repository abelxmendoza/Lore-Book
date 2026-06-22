import { logger } from '../../logger';
import { supabaseAdmin } from '../../services/supabaseClient';

import { parseScopeString, scopesToString, type McpOAuthScope } from './mcpOAuthConstants';
import {
  generateOpaqueToken,
  hashToken,
  signMcpAccessToken,
  signPendingAuthorize,
  verifyPkceS256,
  verifyPendingAuthorize,
} from './mcpOAuthJwt';

export type OAuthClient = {
  clientId: string;
  clientName: string;
  clientType: 'public' | 'confidential';
  redirectUris: string[];
  allowedScopes: string[];
  clientSecret?: string;
};

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

const CODE_TTL_SEC = 600;

function normalizeRedirectUri(uri: string): string {
  return uri.trim();
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const { data, error } = await supabaseAdmin
    .from('mcp_oauth_clients')
    .select('client_id, client_name, client_type, redirect_uris, allowed_scopes, metadata, revoked_at')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    clientId: data.client_id,
    clientName: data.client_name,
    clientType: data.client_type as 'public' | 'confidential',
    redirectUris: data.redirect_uris ?? [],
    allowedScopes: data.allowed_scopes ?? ['memory:read'],
    clientSecret: typeof metadata.client_secret === 'string' ? metadata.client_secret : undefined,
  };
}

function intersectScopes(requested: McpOAuthScope[], allowed: string[]): McpOAuthScope[] {
  const allowedSet = new Set(allowed);
  const granted = requested.filter((s) => allowedSet.has(s));
  return granted.length > 0 ? granted : (['memory:read'] as McpOAuthScope[]);
}

export function validateAuthorizeRequest(
  client: OAuthClient,
  params: AuthorizeRequest
): { ok: true; scopes: McpOAuthScope[] } | { ok: false; error: string } {
  if (!client.redirectUris.includes(normalizeRedirectUri(params.redirectUri))) {
    return { ok: false, error: 'invalid_redirect_uri' };
  }
  if (params.codeChallengeMethod !== 'S256') {
    return { ok: false, error: 'invalid_code_challenge_method' };
  }
  if (!params.codeChallenge || params.codeChallenge.length < 10) {
    return { ok: false, error: 'invalid_code_challenge' };
  }

  const requested = parseScopeString(params.scope);
  const scopes = intersectScopes(requested, client.allowedScopes);
  return { ok: true, scopes };
}

export function createPendingAuthorizeToken(params: AuthorizeRequest & { scopes: string[] }): string {
  return signPendingAuthorize({
    client_id: params.clientId,
    redirect_uri: normalizeRedirectUri(params.redirectUri),
    scope: scopesToString(params.scopes),
    state: params.state ?? null,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
  });
}

export function parsePendingAuthorizeToken(token: string): (AuthorizeRequest & { scopes: string[] }) | null {
  const payload = verifyPendingAuthorize(token);
  if (!payload) return null;

  return {
    clientId: String(payload.client_id ?? ''),
    redirectUri: String(payload.redirect_uri ?? ''),
    scope: String(payload.scope ?? 'memory:read'),
    state: payload.state ? String(payload.state) : undefined,
    codeChallenge: String(payload.code_challenge ?? ''),
    codeChallengeMethod: String(payload.code_challenge_method ?? 'S256'),
    scopes: parseScopeString(String(payload.scope ?? 'memory:read')),
  };
}

export async function issueAuthorizationCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const code = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();

  const { error } = await supabaseAdmin.from('mcp_oauth_authorization_codes').insert({
    code_hash: hashToken(code),
    user_id: params.userId,
    client_id: params.clientId,
    redirect_uri: normalizeRedirectUri(params.redirectUri),
    scopes: params.scopes,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error({ error, clientId: params.clientId }, 'Failed to store MCP authorization code');
    throw new Error('authorization_code_store_failed');
  }

  return code;
}

export function buildAuthorizationRedirect(
  redirectUri: string,
  code: string,
  state?: string
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

async function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ userId: string; scopes: string[]; clientId: string } | null> {
  const codeHash = hashToken(params.code);
  const { data, error } = await supabaseAdmin
    .from('mcp_oauth_authorization_codes')
    .select('*')
    .eq('code_hash', codeHash)
    .is('consumed_at', null)
    .maybeSingle();

  if (error || !data) return null;
  if (data.client_id !== params.clientId) return null;
  if (data.redirect_uri !== normalizeRedirectUri(params.redirectUri)) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (!verifyPkceS256(params.codeVerifier, data.code_challenge)) return null;

  await supabaseAdmin
    .from('mcp_oauth_authorization_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    userId: data.user_id,
    scopes: data.scopes ?? ['memory:read'],
    clientId: data.client_id,
  };
}

async function issueRefreshToken(params: {
  userId: string;
  clientId: string;
  scopes: string[];
}): Promise<string> {
  const refreshToken = generateOpaqueToken(48);
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabaseAdmin.from('mcp_oauth_refresh_tokens').insert({
    token_hash: hashToken(refreshToken),
    user_id: params.userId,
    client_id: params.clientId,
    scopes: params.scopes,
    expires_at: expiresAt,
  });

  if (error) throw new Error('refresh_token_store_failed');
  return refreshToken;
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse | null> {
  const consumed = await consumeAuthorizationCode(params);
  if (!consumed) return null;

  const { token, expiresIn } = signMcpAccessToken({
    sub: consumed.userId,
    clientId: consumed.clientId,
    scopes: consumed.scopes,
  });

  const refreshToken = await issueRefreshToken({
    userId: consumed.userId,
    clientId: consumed.clientId,
    scopes: consumed.scopes,
  });

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: scopesToString(consumed.scopes),
  };
}

export async function exchangeRefreshToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<TokenResponse | null> {
  const tokenHash = hashToken(params.refreshToken);
  const { data, error } = await supabaseAdmin
    .from('mcp_oauth_refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;
  if (data.client_id !== params.clientId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const { token, expiresIn } = signMcpAccessToken({
    sub: data.user_id,
    clientId: data.client_id,
    scopes: data.scopes ?? ['memory:read'],
  });

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: scopesToString(data.scopes ?? ['memory:read']),
  };
}

export async function registerOAuthClient(params: {
  clientName: string;
  redirectUris: string[];
  clientType?: 'public' | 'confidential';
}): Promise<{ client_id: string; client_secret?: string; client_id_issued_at: number }> {
  const clientId = `mcp_${generateOpaqueToken(12)}`;
  const clientSecret = params.clientType === 'confidential' ? generateOpaqueToken(24) : undefined;

  const { error } = await supabaseAdmin.from('mcp_oauth_clients').insert({
    client_id: clientId,
    client_name: params.clientName,
    client_type: params.clientType ?? 'public',
    redirect_uris: params.redirectUris,
    allowed_scopes: ['memory:read', 'memory:write', 'entity:write'],
    metadata: clientSecret ? { client_secret: clientSecret } : {},
  });

  if (error) throw new Error('client_registration_failed');

  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

export async function approvePendingAuthorization(params: {
  pendingToken: string;
  userId: string;
}): Promise<{ redirectUrl: string } | { error: string }> {
  const pending = parsePendingAuthorizeToken(params.pendingToken);
  if (!pending) return { error: 'invalid_pending_token' };

  const client = await getOAuthClient(pending.clientId);
  if (!client) return { error: 'invalid_client' };

  const validation = validateAuthorizeRequest(client, pending);
  if (!validation.ok) return { error: validation.error };

  const code = await issueAuthorizationCode({
    userId: params.userId,
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    scopes: validation.scopes,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
  });

  return {
    redirectUrl: buildAuthorizationRedirect(pending.redirectUri, code, pending.state),
  };
}
