import pino from 'pino';

// Error instances have non-enumerable props, so `logger.warn({ e }, ...)`
// prints `e: {}` and the failure is invisible. Pino only applies its Error
// serializer to the `err` key by default; the codebase logs errors under
// `e`, `error`, and `err`, so register the serializer for all three.
// Supabase PostgrestErrors are plain objects and pass through untouched.
const errSerializer = pino.stdSerializers.err;

export const logger = pino({
  name: 'lorebook-server',
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: {
    err: errSerializer,
    error: errSerializer,
    e: errSerializer,
  },
  // Pretty in dev by default. Set LOG_PRETTY=false to emit raw JSON in dev too —
  // needed to capture structured telemetry (ingestion.cost / stage.timing with
  // their steps[]/stages[] arrays) that pino-pretty would otherwise flatten away.
  transport:
    process.env.NODE_ENV !== 'production' && process.env.LOG_PRETTY !== 'false'
      ? { target: 'pino-pretty' }
      : undefined
});
