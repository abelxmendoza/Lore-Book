/**
 * Server port + bind-host resolution.
 *
 * Extracted into a pure, dependency-free module so it can be unit-tested and so
 * the boot path has exactly one source of truth for which port the process
 * listens on.
 *
 * BACKGROUND (incident 2026-06-18): the Railway public domain forwarded traffic
 * to its target port (8080), but a `PORT=4000` service variable made the app
 * listen on 4000. Nothing was listening on 8080, so Railway's edge returned
 * `502 "Application failed to respond"` on every request even though the process
 * was healthy. This module makes the resolved port explicit and surfaces the
 * common misconfigurations as structured warnings the boot path can log loudly.
 */

export const DEFAULT_PORT = 4000;

/** Railway's conventional default container port. Used only for advisory checks. */
export const RAILWAY_DEFAULT_PORT = 8080;

export type PortResolution = {
  /** The validated port the server should bind to. */
  port: number;
  /** Where the value came from: 'PORT' env var or the built-in default. */
  source: 'PORT' | 'default';
  /** The raw env value seen (for diagnostics), if any. */
  rawValue?: string;
  /** Non-fatal advisories worth logging at boot. */
  warnings: string[];
};

const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * Resolve the port the HTTP server should bind to from an environment map.
 *
 * Never throws — always returns a usable port (falling back to {@link DEFAULT_PORT})
 * plus a list of human-readable warnings so the caller can decide how loudly to
 * complain. This keeps the boot path resilient: a malformed PORT must not crash
 * the container before it can even serve `/api/health`.
 */
export function resolveServerPort(
  env: NodeJS.ProcessEnv = process.env
): PortResolution {
  const warnings: string[] = [];
  const raw = env.PORT;

  if (raw === undefined || raw.trim() === '') {
    return { port: DEFAULT_PORT, source: 'default', warnings };
  }

  const trimmed = raw.trim();
  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    warnings.push(
      `PORT="${raw}" is not a valid integer; falling back to ${DEFAULT_PORT}.`
    );
    return { port: DEFAULT_PORT, source: 'default', rawValue: raw, warnings };
  }

  if (parsed < MIN_PORT || parsed > MAX_PORT) {
    warnings.push(
      `PORT=${parsed} is outside the valid range ${MIN_PORT}-${MAX_PORT}; ` +
        `falling back to ${DEFAULT_PORT}.`
    );
    return { port: DEFAULT_PORT, source: 'default', rawValue: raw, warnings };
  }

  // Advisory: on hosted platforms the platform usually injects PORT. If we see a
  // hard-coded non-default that does NOT match the platform's expectation, the
  // edge proxy may not be able to reach us (the exact 2026-06-18 outage).
  const isHosted = Boolean(
    env.RAILWAY_ENVIRONMENT || env.RENDER || env.FLY_APP_NAME
  );
  if (isHosted && env.RAILWAY_ENVIRONMENT && parsed !== RAILWAY_DEFAULT_PORT) {
    warnings.push(
      `Running on Railway with PORT=${parsed}. Railway's default target port is ` +
        `${RAILWAY_DEFAULT_PORT}; ensure the service's public domain "Target port" ` +
        `matches ${parsed}, or the edge proxy will return 502 "Application failed to respond".`
    );
  }

  return { port: parsed, source: 'PORT', rawValue: raw, warnings };
}

/**
 * Resolve the bind host. Containers must bind to all interfaces (0.0.0.0) rather
 * than localhost so the platform's edge/healthcheck can reach the process.
 * Override with HOST only when you have a specific reason.
 */
export function resolveBindHost(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.HOST?.trim();
  return host && host.length > 0 ? host : '0.0.0.0';
}
