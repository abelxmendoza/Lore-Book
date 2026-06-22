import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    mcpOAuthIssuer: 'https://api.lorebook.test',
    mcpResourceAudience: 'mcp.lorebookai.com',
    mcpOAuthJwtSecret: 'test-oauth-secret-32-chars-minimum!!',
    mcpOAuthAccessTokenTtlSec: 900,
  },
}));

import {
  generateOpaqueToken,
  signMcpAccessToken,
  verifyMcpAccessToken,
  verifyPkceS256,
  signPendingAuthorize,
  verifyPendingAuthorize,
} from '../../src/mcp/oauth/mcpOAuthJwt';
import { parseScopeString } from '../../src/mcp/oauth/mcpOAuthConstants';

describe('mcpOAuthJwt', () => {
  it('signs and verifies MCP access tokens', () => {
    const { token } = signMcpAccessToken({
      sub: 'user-1',
      clientId: 'chatgpt-mcp',
      scopes: ['memory:read', 'memory:write'],
    });

    const verified = verifyMcpAccessToken(token);
    expect(verified).toMatchObject({
      sub: 'user-1',
      clientId: 'chatgpt-mcp',
      scopes: ['memory:read', 'memory:write'],
    });
  });

  it('rejects tokens with wrong audience', () => {
    const { token } = signMcpAccessToken({
      sub: 'user-1',
      clientId: 'chatgpt-mcp',
      scopes: ['memory:read'],
    });
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.aud = 'wrong';
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;
    expect(verifyMcpAccessToken(tampered)).toBeNull();
  });

  it('validates PKCE S256', () => {
    const verifier = generateOpaqueToken(32);
    const digest = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(verifier, digest)).toBe(true);
    expect(verifyPkceS256(verifier, 'bad')).toBe(false);
  });

  it('round-trips pending authorize tokens', () => {
    const pending = signPendingAuthorize({
      client_id: 'chatgpt-mcp',
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      scope: 'memory:read',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
    });
    const parsed = verifyPendingAuthorize(pending);
    expect(parsed?.client_id).toBe('chatgpt-mcp');
  });
});

describe('mcpOAuthConstants', () => {
  it('parses scopes and filters unknown values', () => {
    expect(parseScopeString('memory:read memory:write unknown:scope')).toEqual([
      'memory:read',
      'memory:write',
    ]);
  });
});
