/** Public marketing entry — first page for visitors who are not in the app yet. */
export const LANDING_PATH = '/';

const RETURN_KEY = 'lk_auth_return';

const BLOCKED_RETURN_PREFIXES = [LANDING_PATH, '/login', '/auth/', '/demo'];

function isBlockedReturnPath(path: string): boolean {
  return BLOCKED_RETURN_PREFIXES.some(
    (prefix) => path === prefix || (prefix !== '/' && path.startsWith(prefix))
  );
}

/** Remember where the user was headed before we sent them to the landing page. */
export function saveAuthReturnPath(pathname: string, search = ''): void {
  if (typeof window === 'undefined') return;
  const path = `${pathname}${search}`;
  if (!path || isBlockedReturnPath(path)) return;
  sessionStorage.setItem(RETURN_KEY, path);
}

/** Default post-login destination when no saved return path exists. */
export const DEFAULT_APP_PATH = '/home';

export function consumeAuthReturnPath(fallback = DEFAULT_APP_PATH): string {
  if (typeof window === 'undefined') return fallback;
  const saved = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (!saved || isBlockedReturnPath(saved)) return fallback;
  return saved;
}
