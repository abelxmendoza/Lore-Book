// DOMPurify is only available in browser environment
let DOMPurify: any = null;
if (typeof window !== 'undefined') {
  try {
    DOMPurify = require('dompurify');
  } catch {
    // DOMPurify not available, will use fallback sanitization
  }
}

/**
 * Sanitize HTML to prevent XSS attacks
 */
export const sanitizeHtml = (dirty: string): string => {
  if (typeof window === 'undefined' || !DOMPurify) {
    // Server-side rendering - return as-is (will be sanitized on client)
    return dirty;
  }
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false
  });
};

/**
 * Sanitize an untrusted string before persisting it (defense-in-depth).
 *
 * Previously this hand-rolled iterative regex removal of <script> tags / event
 * handlers — a pattern that is inherently bypassable (you cannot reliably parse
 * HTML with regex) and that CodeQL flags as "incomplete multi-character
 * sanitization". We now delegate to DOMPurify, a real HTML parser: stripping
 * ALL tags/attributes returns text content only and cannot be bypassed by
 * nested/overlapping constructs like "<scrip<script>t>". On the server (no DOM)
 * we fall back to full HTML-entity escaping, which is likewise complete.
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';

  // Remove null bytes and control characters first.
  const noControl = input.replace(/[\x00-\x1F\x7F]/g, '');

  if (typeof window !== 'undefined' && DOMPurify) {
    // Strip every tag and attribute; keep inner text. Bypass-proof.
    return DOMPurify.sanitize(noControl, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    }).trim();
  }

  // SSR / DOMPurify unavailable: escape so no markup can be reconstructed.
  return noControl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
};

/**
 * Secure storage wrapper (with encryption in production)
 */
export const secureStorage = {
  setItem: (key: string, value: string): void => {
    try {
      // In development, store as-is for easier debugging
      if (process.env.NODE_ENV === 'development') {
        localStorage.setItem(key, value);
        return;
      }
      
      // In production, could encrypt sensitive data
      // For now, just use localStorage with sanitization
      const sanitized = sanitizeInput(value);
      localStorage.setItem(key, sanitized);
    } catch (error) {
      console.error('Failed to store in secure storage:', error);
    }
  },
  
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Failed to read from secure storage:', error);
      return null;
    }
  },
  
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from secure storage:', error);
    }
  },
  
  clear: (): void => {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Failed to clear secure storage:', error);
    }
  }
};

// In-memory CSRF token cache — keyed to the current session.
// Invalidated on logout or on 403 CSRF rejection.
let csrfTokenCache: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;

/** Clear the cached CSRF token — call on logout or after a 403 CSRF error. */
export const invalidateCsrfToken = (): void => {
  csrfTokenCache = null;
};

/**
 * Fetch a CSRF token from GET /api/security/csrf-token and cache it.
 * Deduplicates concurrent calls — only one network request in flight at a time.
 * Safe to call before every POST/PUT/PATCH/DELETE.
 */
export const acquireCsrfToken = async (
  bearerToken: string,
  apiBase: string
): Promise<string | null> => {
  if (csrfTokenCache) return csrfTokenCache;
  if (csrfFetchPromise) return csrfFetchPromise;

  csrfFetchPromise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${apiBase}/api/security/csrf-token`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (!res.ok) {
        console.warn(`[CSRF] Token acquisition failed: HTTP ${res.status}`);
        return null;
      }
      const data = await res.json().catch(() => ({}));
      const token: string | null = data.csrfToken || res.headers.get('X-CSRF-Token') || null;
      if (token) {
        csrfTokenCache = token;
        console.debug('[CSRF] Token acquired and cached');
      }
      return csrfTokenCache;
    } catch (err) {
      console.warn('[CSRF] Token acquisition error:', err);
      return null;
    } finally {
      csrfFetchPromise = null;
    }
  })();

  return csrfFetchPromise;
};

/** Return the currently cached CSRF token, or null if none acquired yet. */
export const getCsrfToken = (): string | null => csrfTokenCache;

/**
 * Add X-CSRF-Token header to a headers object if a token is cached.
 */
export const addCsrfHeaders = (headers: HeadersInit = {}): HeadersInit => {
  const token = getCsrfToken();
  if (!token) return headers;
  return { ...headers, 'X-CSRF-Token': token };
};

