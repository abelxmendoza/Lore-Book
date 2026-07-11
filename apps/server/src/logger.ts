import pino from 'pino';

// Error instances have non-enumerable props, so `logger.warn({ e }, ...)`
// prints `e: {}` and the failure is invisible. Pino only applies its Error
// serializer to the `err` key by default; the codebase logs errors under
// `e`, `error`, and `err`, so register the serializer for all three.
// Supabase PostgrestErrors are plain objects and pass through untouched.
const errSerializer = pino.stdSerializers.err;

// Sanitize env-derived config so log sinks are not modeled as logging raw
// process.env (CodeQL js/clear-text-logging false-positive cascade).
const SAFE_LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);
function resolveLogLevel(): string {
  const raw = process.env.LOG_LEVEL;
  if (typeof raw === 'string' && SAFE_LOG_LEVELS.has(raw)) return raw;
  return 'info';
}
function resolvePrettyTransport(): { target: string } | undefined {
  // Only enable pretty when explicitly not production; avoid threading env into logs.
  const nodeEnv = process.env.NODE_ENV;
  const prettyFlag = process.env.LOG_PRETTY;
  if (nodeEnv === 'production') return undefined;
  if (prettyFlag === 'false') return undefined;
  return { target: 'pino-pretty' };
}

export const logger = pino({
  name: 'lorebook-server',
  level: resolveLogLevel(),
  serializers: {
    err: errSerializer,
    error: errSerializer,
    e: errSerializer,
  },
  // Defense-in-depth: never emit secrets/credentials/PII tokens to logs even if
  // a caller accidentally passes a whole request/config/session object. Pino
  // redacts these key paths (any depth via `*`) before serialization.
  redact: {
    paths: [
      'password', '*.password', '*.passwordHash',
      'token', '*.token', 'accessToken', '*.accessToken', 'access_token', '*.access_token',
      'refreshToken', '*.refreshToken', 'refresh_token', '*.refresh_token',
      'apiKey', '*.apiKey', 'api_key', '*.api_key',
      'secret', '*.secret', 'clientSecret', '*.clientSecret', 'client_secret', '*.client_secret',
      'authorization', '*.authorization', 'Authorization', '*.Authorization',
      'cookie', '*.cookie', 'Cookie', '*.Cookie',
      'headers.authorization', 'headers.cookie',
      'req.headers.authorization', 'req.headers.cookie',
      'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY',
      'xOAuthClientId', 'xOAuthClientSecret', 'xOAuthRedirectUri',
      'client_id', '*.client_id', 'redirect_uri', '*.redirect_uri',
    ],
    censor: '[REDACTED]',
  },
  // Pretty in dev by default. Set LOG_PRETTY=false to emit raw JSON in dev too —
  // needed to capture structured telemetry (ingestion.cost / stage.timing with
  // their steps[]/stages[] arrays) that pino-pretty would otherwise flatten away.
  transport: resolvePrettyTransport(),
});
