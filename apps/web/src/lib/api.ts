import { supabase } from './supabase';
import { addCsrfHeaders, acquireCsrfToken, getCsrfToken, invalidateCsrfToken } from './security';
import { config, log } from '../config/env';
import { performance as perfMonitoring, errorTracking } from './monitoring';
import { apiCache, generateCacheKey } from './cache';
import { handleError, createAppError, retryWithBackoff, type AppError } from './errorHandler';
import { getGlobalMockDataEnabled, getBackendUnavailable, notifyBackendReachable } from '../contexts/MockDataContext';

// Log backend-down message once per session to avoid console flood
let backendDownWarned = false;

// Stale-token self-heal: when a request 401s, refresh the Supabase session
// once and retry. Deduped so a page-load burst of parallel 401s (10+ requests
// all carrying the same expired token) triggers exactly one refresh call.
let refreshInFlight: Promise<string | null> | null = null;
async function refreshAccessTokenOnce(): Promise<string | null> {
  refreshInFlight ??= supabase.auth
    .refreshSession()
    .then(({ data, error }) => (error ? null : data.session?.access_token ?? null))
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export const fetchJson = async <T>(
  input: RequestInfo, 
  init?: RequestInit,
  options?: {
    useMockData?: boolean;
    mockData?: T;
    onError?: (error: Error) => void;
    /** Override default API timeout (ms). Use for heavy admin aggregates on mobile. */
    timeoutMs?: number;
  }
): Promise<T> => {
  // Get session first so we can skip mock when user is logged in
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  // Short-circuit: when backend is known down, return mock only if user is NOT logged in
  if (getBackendUnavailable() && options?.mockData !== undefined && !token) {
    if (config.logging.logApiCalls) {
      log.debug('Backend unavailable, using mock data (no request):', typeof input === 'string' ? input : 'Request');
    }
    return options.mockData;
  }

  // When user is logged in, never use mock data — always use real backend
  const isLoggedIn = !!token;

  // Use configured API URL
  const apiBaseUrl = config.api.url;
  
  // If input is a relative URL, prepend the API base URL
  const url = typeof input === 'string' && input.startsWith('/') 
    ? `${apiBaseUrl}${input}`
    : input;
  
  const startTime = performance.now();
  
  // Check global mock data toggle — only when not logged in (logged-in users always get real data)
  const globalMockEnabled = getGlobalMockDataEnabled();
  const shouldUseMock = !isLoggedIn && (globalMockEnabled || options?.useMockData === true) && 
                       options?.useMockData !== false;
  
  // Demo/mock mode: return mock data immediately without a network call.
  // Prevents 401s in demo mode (guest users have no JWT) and ensures
  // the UI always shows synthetic data when mock is active.
  if (shouldUseMock && options?.mockData !== undefined) {
    return options.mockData;
  }

  // Check cache for GET requests (skip cache if using mock data)
  const isGetRequest = !init?.method || init.method === 'GET';
  const useCache = !shouldUseMock && isGetRequest;
  const urlStr = typeof url === 'string' ? url : (url as Request).url;
  const cacheKey = useCache ? generateCacheKey(urlStr, init) : null;

  if (cacheKey) {
    const cached = apiCache.get<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    // Deduplicate: return the existing in-flight promise instead of making a duplicate request
    const inflight = apiCache.getInflight<T>(cacheKey);
    if (inflight) return inflight;
  }

  const fetchPromise = (async (): Promise<T> => {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    // Routing diagnostics — log on every request in dev, or in prod when baseUrl is empty
    // (empty baseUrl in prod = misconfigured VITE_API_URL, requests hit Vercel instead of Railway)
    const hasRoutingConcern = config.env.isProduction && !apiBaseUrl;
    if (config.logging.logApiCalls || hasRoutingConcern) {
      let resolvedOrigin: string;
      try {
        resolvedOrigin = apiBaseUrl ? new URL(apiBaseUrl).origin : window.location.origin;
      } catch {
        resolvedOrigin = apiBaseUrl || window.location.origin;
      }
      const logFn = hasRoutingConcern ? console.error : console.log;
      logFn(
        `[API] baseUrl=${apiBaseUrl || '(empty→same-origin)'} requestUrl=${urlStr} ` +
        `environment=${import.meta.env.MODE} resolvedOrigin=${resolvedOrigin}`
      );
    }

    try {
      if (config.logging.logApiCalls) {
        log.debug(`API Request: ${urlStr}`, { method: init?.method || 'GET' });
      }

      // Pre-acquire CSRF token before mutating requests so csrfProtection middleware
      // doesn't reject the first POST/PUT/PATCH/DELETE with 403.
      const isMutatingMethod = !!init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method);
      if (isMutatingMethod && token && !getCsrfToken()) {
        console.debug(`[CSRF] Acquiring token before ${init.method} ${urlStr}`);
        await acquireCsrfToken(token, apiBaseUrl);
      }

      const buildHeaders = (authToken: string | undefined) =>
        addCsrfHeaders({
          'Content-Type': 'application/json',
          // The user's IANA timezone rides every request so the server resolves
          // "yesterday"/"last night" in THEIR day, not the UTC day.
          'X-User-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          ...(init?.headers ?? {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        });

      timeoutId = setTimeout(
        () => controller.abort(),
        options?.timeoutMs ?? config.api.timeout
      );

      let res = await fetch(url, { headers: buildHeaders(token), signal: controller.signal, ...init });

      // 401 with a token usually means the access token expired while the tab
      // was asleep (session restored from storage as "authenticated", refresh
      // not landed yet). Refresh once and retry inline — recursing into
      // fetchJson would deadlock on the in-flight request dedupe.
      if (res.status === 401 && token) {
        const freshToken = await refreshAccessTokenOnce();
        if (freshToken && freshToken !== token) {
          log.debug(`[Auth] Refreshed stale session, retrying ${urlStr}`);
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(
            () => controller.abort(),
            options?.timeoutMs ?? config.api.timeout
          );
          res = await fetch(url, { headers: buildHeaders(freshToken), signal: controller.signal, ...init });
        }
      }

      if (timeoutId) clearTimeout(timeoutId);

      const duration = performance.now() - startTime;
      perfMonitoring.trackApiCall(typeof input === 'string' ? input : 'Request', duration, true);
      if (config.logging.logPerformance) {
        log.debug(`API Response: ${duration.toFixed(2)}ms`, { url: typeof input === 'string' ? input : 'Request' });
      }

      if (res.ok) notifyBackendReachable();

      // Routing guard: HTML response means the request hit Vercel/proxy instead of the API.
      // Fail loud before JSON.parse produces a cryptic "unexpected character" error.
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('text/html')) {
        const routingError = new Error(
          config.env.isProduction
            ? `API routing error: server returned HTML for ${urlStr}. ` +
              'Verify VITE_API_URL is set to the Railway backend in Vercel → Settings → Environment Variables.'
            : `API returned HTML instead of JSON for ${urlStr}. Is the backend running?`
        );
        if (options?.onError) options.onError(routingError);
        throw routingError;
      }

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        let errorMessage = error.message || error.error || `HTTP ${res.status}: ${res.statusText}`;
        const isSchemaIncomplete = res.status === 503 && (error.error === 'Database schema incomplete' || Array.isArray(error.missingTables));
        if (isSchemaIncomplete) {
          errorMessage = error.message || 'Database schema incomplete. Run: ./scripts/run-base-migrations.sh';
        }
        if (res.status === 503 && typeof error.message === 'string' && error.message.includes('EXPERIMENTAL')) {
          errorMessage =
            'This feature is not enabled on the production API yet. Contact support if this persists after deploy.';
        }
        // 500 from a single route ≠ backend down (Vite proxy to a running server is common in dev).
        const backendDownStatus = res.status === 0 || res.status === 503 || res.status === 502;
        if ((config.dev.allowMockData || globalMockEnabled) && backendDownStatus) {
          if (shouldUseMock && options?.mockData) {
            log.debug(
              isSchemaIncomplete ? 'Database schema incomplete, using mock data:' : 'Backend unavailable, using mock data:',
              typeof input === 'string' ? input : 'Request'
            );
            return options.mockData;
          }
          if (config.dev.verboseErrors && !backendDownWarned) {
            backendDownWarned = true;
            log.warn(
              isSchemaIncomplete
                ? 'Database schema incomplete. Using fallback. Run: ./scripts/run-base-migrations.sh'
                : 'Backend server is not running. Using fallback behavior. Start: cd apps/server && npm run dev'
            );
          }
        }
        // CSRF token rejected — invalidate cache, re-acquire for next attempt, surface clear error.
        // Happens when the session's token expired (1hr TTL) or was never acquired.
        if (res.status === 403) {
          const csrfErrors = new Set(['CSRF token required', 'CSRF token expired', 'Invalid CSRF token', 'CSRF token missing']);
          if (csrfErrors.has(error.error)) {
            console.warn(`[CSRF] ${error.error} on ${init?.method} ${urlStr} — invalidating cache`);
            invalidateCsrfToken();
            if (token) await acquireCsrfToken(token, apiBaseUrl).catch(() => {});
            const csrfError = new Error('Security validation failed. Please refresh and try again.');
            if (options?.onError) options.onError(csrfError);
            throw csrfError;
          }
        }

        if (res.status === 401) {
          const authError = new Error(
            error.error === 'Invalid session'
              ? 'Your session expired. Please sign in again.'
              : 'Authentication required. Please sign in again.'
          );
          if (options?.onError) options.onError(authError);
          throw authError;
        }
        const apiError = new Error(errorMessage) as Error & {
          status?: number;
          retryAfter?: number;
        };
        apiError.status = res.status;
        if (typeof error.retryAfter === 'number') apiError.retryAfter = error.retryAfter;
        if (options?.onError) options.onError(apiError);
        throw apiError;
      }

      const data = await res.json();

      if (cacheKey && res.ok) {
        const ttl = options?.mockData ? undefined : 5 * 60 * 1000;
        apiCache.set(cacheKey, data, ttl);
      }

      if (init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method)) {
        const urlPattern = urlStr.split('?')[0];
        if (urlPattern.includes('/api/quests')) {
          apiCache.deletePattern(/\/api\/quests(\/|\?|:)/);
        }
        apiCache.deletePattern(new RegExp(urlPattern.replace(/\/[^/]+$/, '/.*')));
        const collectionPath = urlPattern.replace(/\/[^/]+\/[^/]+$/, '');
        if (collectionPath && collectionPath !== urlPattern) {
          apiCache.deletePattern(new RegExp(`${collectionPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$|\\?)`));
        }
      }

      return data;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const isNetworkError =
        (error instanceof TypeError && (
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('ERR_CONNECTION_REFUSED') ||
          error.message.includes('ERR_INTERNET_DISCONNECTED') ||
          error.message.includes('ERR_NETWORK_CHANGED')
        )) ||
        (error instanceof Error && error.name === 'NetworkError') ||
        (error instanceof DOMException && error.name === 'NetworkError');

      if (isNetworkError) {
        if (config.env.isDevelopment && !backendDownWarned) {
          backendDownWarned = true;
          log.warn('Backend server is not running. Start: cd apps/server && npm run dev', {
            url: typeof input === 'string' ? input : 'Request',
            apiBaseUrl: apiBaseUrl || '(proxy)',
          });
        }
        if ((config.dev.allowMockData || globalMockEnabled) && shouldUseMock && options?.mockData) {
          log.debug('Network error, using mock data:', typeof input === 'string' ? input : 'Request');
          return options.mockData;
        }
        const networkError = createAppError(
          config.dev.verboseErrors
            ? `Cannot connect to backend server at ${apiBaseUrl}. Make sure it's running.`
            : 'Unable to connect to server. Please try again later.',
          'network',
          {
            code: 'CONNECTION_REFUSED',
            userMessage: config.dev.verboseErrors
              ? `Backend server is not running. Start it with: cd apps/server && npm run dev`
              : 'Unable to connect to server. Please check your connection and try again.',
            retryable: true,
            context: {
              url: typeof input === 'string' ? input : 'Request',
              apiBaseUrl,
              errorMessage: error instanceof Error ? error.message : String(error),
            },
            originalError: error instanceof Error ? error : new Error(String(error)),
          }
        );
        if (options?.onError) options.onError(networkError);
        throw networkError;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('Request timed out. Please try again.');
        if (options?.onError) options.onError(timeoutError);
        throw timeoutError;
      }

      const duration = performance.now() - startTime;
      perfMonitoring.trackApiCall(typeof input === 'string' ? input : 'Request', duration, false);

      const appError = handleError(error, {
        component: 'api',
        action: typeof input === 'string' ? input : 'Request',
        metadata: {
          url: typeof input === 'string' ? input : 'Request',
          method: init?.method || 'GET',
          duration,
        },
      });
      if (options?.onError) options.onError(appError);
      throw appError;
    }
  })();

  if (cacheKey) apiCache.trackInflight(cacheKey, fetchPromise);
  return fetchPromise;
};
