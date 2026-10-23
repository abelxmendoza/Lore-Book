/**
 * Mint a propose-only credential for the signed-in user.
 * The token is bound to that user. It cannot approve canon or act as another account.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../../services/supabaseClient';

import {
  HIVEMIND_AGENT_CLIENT_ID,
  HIVEMIND_AGENT_SCOPES,
  scopesToString,
} from './mcpOAuthConstants';
import { generateOpaqueToken, hashToken, signMcpAccessToken } from './mcpOAuthJwt';
import type { TokenResponse } from './mcpOAuthService';

const ACCESS_TTL_SEC = 60 * 60 * 24 * 30;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function issueHivemindAgentToken(userId: string): Promise<TokenResponse> {
  const scopes = [...HIVEMIND_AGENT_SCOPES];

  const { error: clientError } = await supabaseAdmin.from('mcp_oauth_clients').upsert(
    {
      client_id: HIVEMIND_AGENT_CLIENT_ID,
      client_name: 'Agent Hivemind',
      client_type: 'public',
      redirect_uris: ['http://127.0.0.1/lorebook-hivemind'],
      allowed_scopes: scopes,
      revoked_at: null,
      metadata: { purpose: 'delegated-propose', memory_write: false },
    },
    { onConflict: 'client_id' },
  );

  if (clientError) {
    logger.error({ err: clientError, userId }, 'Failed to upsert hivemind MCP client');
    throw new Error('agent_client_store_failed');
  }

  const { token, expiresIn } = signMcpAccessToken({
    sub: userId,
    clientId: HIVEMIND_AGENT_CLIENT_ID,
    scopes,
    ttlSeconds: ACCESS_TTL_SEC,
  });

  const refreshToken = generateOpaqueToken(48);
  const { error: refreshError } = await supabaseAdmin.from('mcp_oauth_refresh_tokens').insert({
    token_hash: hashToken(refreshToken),
    user_id: userId,
    client_id: HIVEMIND_AGENT_CLIENT_ID,
    scopes,
    expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });

  if (refreshError) {
    logger.error({ err: refreshError, userId }, 'Failed to store hivemind refresh token');
    throw new Error('refresh_token_store_failed');
  }

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: scopesToString(scopes),
  };
}
