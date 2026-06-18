export type BackendHealthFailureKind =
  | 'http_error'
  | 'network_or_cors'
  | 'timeout'
  | 'invalid_url'
  | 'unknown';

export type BackendHealthResult =
  | {
      ok: true;
      url: string;
      status: number;
      statusText: string;
      checkedAt: string;
    }
  | {
      ok: false;
      url: string;
      kind: BackendHealthFailureKind;
      status?: number;
      statusText?: string;
      message: string;
      checkedAt: string;
    };

export function resolveHealthUrl(apiBase: string, currentOrigin = ''): string {
  const base = apiBase || currentOrigin;
  if (!base) return '/api/health';
  return `${base.replace(/\/+$/, '')}/api/health`;
}

export function describeBackendHealthFailure(result: BackendHealthResult): string {
  if (result.ok) return 'Backend health check passed.';

  if (result.kind === 'http_error') {
    if (result.status === 502 || result.status === 503 || result.status === 504) {
      return `Backend host responded ${result.status}. The API process or platform proxy is unavailable before the app can answer.`;
    }
    if (result.status === 401 || result.status === 403) {
      return `Backend health check returned ${result.status}. The public health route may be behind auth or blocked by middleware.`;
    }
    return `Backend health check returned HTTP ${result.status ?? 'error'}.`;
  }

  if (result.kind === 'network_or_cors') {
    return 'Browser could not read the backend response. This is usually CORS, DNS, TLS, ad-blocking, or the host returning an error without CORS headers.';
  }

  if (result.kind === 'timeout') {
    return 'Backend health check timed out before receiving a response.';
  }

  if (result.kind === 'invalid_url') {
    return 'Backend URL is invalid. Check VITE_API_URL.';
  }

  return result.message || 'Backend health check failed.';
}

export async function checkBackendHealth(
  apiBase: string,
  opts: { timeoutMs?: number; currentOrigin?: string } = {}
): Promise<BackendHealthResult> {
  const checkedAt = new Date().toISOString();
  const url = resolveHealthUrl(apiBase, opts.currentOrigin ?? (
    typeof window !== 'undefined' ? window.location.origin : ''
  ));

  try {
    new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch {
    return {
      ok: false,
      url,
      kind: 'invalid_url',
      message: `Invalid backend health URL: ${url}`,
      checkedAt,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.ok) {
      return {
        ok: true,
        url,
        status: res.status,
        statusText: res.statusText,
        checkedAt,
      };
    }

    return {
      ok: false,
      url,
      kind: 'http_error',
      status: res.status,
      statusText: res.statusText,
      message: `/api/health returned HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
      checkedAt,
    };
  } catch (error) {
    const isAbort =
      error instanceof DOMException && error.name === 'AbortError' ||
      error instanceof Error && error.name === 'AbortError';
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      url,
      kind: isAbort ? 'timeout' : 'network_or_cors',
      message,
      checkedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
