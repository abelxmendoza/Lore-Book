export function isDevelopmentRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development' || env.API_ENV === 'dev';
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    !isDevelopmentRuntime(env) &&
    (env.NODE_ENV === 'production' ||
      env.API_ENV === 'production' ||
      Boolean(env.RAILWAY_ENVIRONMENT || env.RENDER || env.FLY_APP_NAME))
  );
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
