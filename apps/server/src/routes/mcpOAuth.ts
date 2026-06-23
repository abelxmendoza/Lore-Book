import { Router } from 'express';

import { config } from '../config';
import { logger } from '../logger';
import { authMiddleware } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

import {
  approvePendingAuthorization,
  createPendingAuthorizeToken,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  getOAuthClient,
  registerOAuthClient,
  validateAuthorizeRequest,
} from '../mcp/oauth/mcpOAuthService';
import {
  buildOAuthAuthorizationServerMetadata,
  buildOpenIdConfigurationMetadata,
} from '../mcp/oauth/mcpOAuthMetadata';

export const mcpOAuthRouter = Router();

/**
 * Serialize a value for safe embedding inside an inline <script>. JSON.stringify
 * alone does not escape `</script>` or U+2028/2029, so reflected input could
 * break out of the script context (XSS). Escape the dangerous characters.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? '')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function requestBaseUrl(req: import('express').Request): string {
  if (config.mcpOAuthIssuer) return config.mcpOAuthIssuer.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}`;
}

function oauthError(res: import('express').Response, error: string, description?: string, status = 400) {
  res.status(status).json({
    error,
    error_description: description ?? error,
  });
}

mcpOAuthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json(buildOAuthAuthorizationServerMetadata(requestBaseUrl(req)));
});

mcpOAuthRouter.get('/.well-known/openid-configuration', (req, res) => {
  res.json(buildOpenIdConfigurationMetadata(requestBaseUrl(req)));
});

mcpOAuthRouter.get('/oauth/jwks', (_req, res) => {
  res.json({ keys: [] });
});

mcpOAuthRouter.get('/oauth/authorize', async (req, res) => {
  try {
    const clientId = String(req.query.client_id ?? '');
    const redirectUri = String(req.query.redirect_uri ?? '');
    const responseType = String(req.query.response_type ?? 'code');
    const scope = String(req.query.scope ?? 'memory:read');
    const state = req.query.state ? String(req.query.state) : undefined;
    const codeChallenge = String(req.query.code_challenge ?? '');
    const codeChallengeMethod = String(req.query.code_challenge_method ?? 'S256');

    if (responseType !== 'code') {
      oauthError(res, 'unsupported_response_type');
      return;
    }

    const client = await getOAuthClient(clientId);
    if (!client) {
      oauthError(res, 'invalid_client', undefined, 401);
      return;
    }

    const validation = validateAuthorizeRequest(client, {
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
    });

    if (!validation.ok) {
      oauthError(res, validation.error);
      return;
    }

    const pending = createPendingAuthorizeToken({
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      scopes: validation.scopes,
    });

    const consentUrl = `${requestBaseUrl(req)}/oauth/consent?pending=${encodeURIComponent(pending)}`;
    const loginUrl = config.mcpWebAppUrl
      ? `${config.mcpWebAppUrl.replace(/\/$/, '')}/login?returnTo=${encodeURIComponent(consentUrl)}`
      : consentUrl;

    res.redirect(302, loginUrl);
  } catch (error) {
    logger.error({ error }, 'OAuth authorize failed');
    oauthError(res, 'server_error', undefined, 500);
  }
});

mcpOAuthRouter.get('/oauth/consent', (req, res) => {
  const pending = String(req.query.pending ?? '');
  const webApproveUrl = `${requestBaseUrl(req)}/api/mcp/oauth/approve`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Authorize LoreBook MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; }
    button { background: #111; color: #fff; border: 0; padding: 0.75rem 1.25rem; border-radius: 8px; cursor: pointer; }
    p { color: #444; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Connect LoreBook to this app</h1>
  <p>This app is requesting read access to your personal memory graph (characters, journal entries, relationships).</p>
  <p>Sign in to LoreBook, then approve the connection.</p>
  <button id="approve">Approve connection</button>
  <p id="status"></p>
  <script>
    const pending = ${jsonForScript(pending)};
    const approveUrl = ${jsonForScript(webApproveUrl)};
    document.getElementById('approve').onclick = async () => {
      const status = document.getElementById('status');
      status.textContent = 'Waiting for LoreBook session…';
      const token = localStorage.getItem('sb-access-token') || sessionStorage.getItem('supabase.auth.token');
      let accessToken = null;
      try {
        if (token) {
          const parsed = JSON.parse(token);
          accessToken = parsed?.access_token || parsed?.currentSession?.access_token;
        }
      } catch (_) {}
      if (!accessToken) {
        status.textContent = 'Not signed in. Complete login in LoreBook, then return here and try again.';
        return;
      }
      const resp = await fetch(approveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ pending }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        status.textContent = body.error || 'Approval failed';
        return;
      }
      window.location.href = body.redirectUrl;
    };
  </script>
</body>
</html>`);
});

mcpOAuthRouter.post('/oauth/token', async (req, res) => {
  try {
    const grantType = String(req.body?.grant_type ?? '');
    const clientId = String(req.body?.client_id ?? '');

    if (grantType === 'authorization_code') {
      const result = await exchangeAuthorizationCode({
        code: String(req.body?.code ?? ''),
        clientId,
        redirectUri: String(req.body?.redirect_uri ?? ''),
        codeVerifier: String(req.body?.code_verifier ?? ''),
      });
      if (!result) {
        oauthError(res, 'invalid_grant', undefined, 400);
        return;
      }
      res.json(result);
      return;
    }

    if (grantType === 'refresh_token') {
      const result = await exchangeRefreshToken({
        refreshToken: String(req.body?.refresh_token ?? ''),
        clientId,
      });
      if (!result) {
        oauthError(res, 'invalid_grant', undefined, 400);
        return;
      }
      res.json(result);
      return;
    }

    oauthError(res, 'unsupported_grant_type');
  } catch (error) {
    logger.error({ error }, 'OAuth token exchange failed');
    oauthError(res, 'server_error', undefined, 500);
  }
});

mcpOAuthRouter.post('/oauth/register', async (req, res) => {
  try {
    const clientName = String(req.body?.client_name ?? 'MCP Client');
    const redirectUris = Array.isArray(req.body?.redirect_uris)
      ? req.body.redirect_uris.map(String)
      : [];
    if (!redirectUris.length) {
      oauthError(res, 'invalid_redirect_uri');
      return;
    }

    const registered = await registerOAuthClient({
      clientName,
      redirectUris,
      clientType: req.body?.token_endpoint_auth_method === 'client_secret_post' ? 'confidential' : 'public',
    });

    res.status(201).json({
      ...registered,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: registered.client_secret ? 'client_secret_post' : 'none',
    });
  } catch (error) {
    logger.error({ error }, 'OAuth client registration failed');
    oauthError(res, 'server_error', undefined, 500);
  }
});

export const mcpOAuthApproveRouter = Router();

mcpOAuthApproveRouter.post(
  '/approve',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const pending = String(req.body?.pending ?? '');
    if (!pending) {
      res.status(400).json({ error: 'pending token required' });
      return;
    }

    const result = await approvePendingAuthorization({
      pendingToken: pending,
      userId: req.user!.id,
    });

    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ redirectUrl: result.redirectUrl });
  })
);
