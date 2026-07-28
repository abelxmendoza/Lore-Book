/**
 * Runtime environment predicates.
 *
 * Production and hosted markers always win over development flags. This keeps
 * auth, CSRF, rate-limit, and AI bypasses closed when environment variables
 * conflict on Railway or another hosted runtime.
 */
export function isHostedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RAILWAY_ENVIRONMENT || env.RENDER || env.FLY_APP_NAME || env.VERCEL);
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'production' ||
    env.API_ENV === 'production' ||
    isHostedRuntime(env)
  );
}

export function isDevelopmentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionRuntime(env)) return false;
  return env.NODE_ENV === 'development' || env.API_ENV === 'dev';
}

/**
 * Production unauthenticated chat must stay on guest/demo simulation paths.
 * This prevents direct callers from bypassing the frontend and spending OpenAI
 * tokens through /api/chat or /api/chat/stream.
 */
export function shouldBlockAnonymousAiChat(
  user: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isProductionRuntime(env) && !user;
}
