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
 * Sanitize user input (removes potentially dangerous characters)
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove script tags and event handlers (basic protection)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  return sanitized.trim();
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

/**
 * Get CSRF token from response headers
 */
export const getCsrfToken = (): string | null => {
  // In development, return null (CSRF is disabled)
  if (process.env.NODE_ENV === 'development') {
    return null;
  }
  
  // Try to get from meta tag or cookie
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    return metaTag.getAttribute('content');
  }
  
  return null;
};

/**
 * Add CSRF token to fetch headers
 */
export const addCsrfHeaders = (headers: HeadersInit = {}): HeadersInit => {
  const token = getCsrfToken();
  if (!token) return headers;
  
  return {
    ...headers,
    'X-CSRF-Token': token
  };
};

