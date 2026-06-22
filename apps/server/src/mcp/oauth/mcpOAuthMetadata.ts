import { config } from '../../config';

export function buildOAuthAuthorizationServerMetadata(baseUrl: string) {
  const issuer = config.mcpOAuthIssuer || baseUrl.replace(/\/$/, '');
  const root = issuer;

  return {
    issuer,
    authorization_endpoint: `${root}/oauth/authorize`,
    token_endpoint: `${root}/oauth/token`,
    registration_endpoint: `${root}/oauth/register`,
    revocation_endpoint: `${root}/oauth/revoke`,
    scopes_supported: ['memory:read', 'memory:write', 'entity:write'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    service_documentation: 'https://lorebookai.com/docs/mcp',
  };
}

export function buildOpenIdConfigurationMetadata(baseUrl: string) {
  const oauth = buildOAuthAuthorizationServerMetadata(baseUrl);
  return {
    ...oauth,
    jwks_uri: `${oauth.issuer}/oauth/jwks`,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
  };
}
