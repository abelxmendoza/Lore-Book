import { supabase } from './supabase';
import { addCsrfHeaders } from './security';

export const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  try {
    // Add CSRF token and auth headers
    const headers = addCsrfHeaders({
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
    
    const res = await fetch(input, {
      headers,
      ...init
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const errorMessage = error.error || error.message || `HTTP ${res.status}: ${res.statusText}`;
      
      // Check if backend is not running
      if (res.status === 0 || res.status === 503 || res.status === 502) {
        throw new Error('Backend server is not running. Please start it with: pnpm run dev:server');
      }
      
      // Check for authentication errors
      if (res.status === 401) {
        throw new Error('Authentication required. Please sign in again.');
      }
      
      throw new Error(errorMessage);
    }
    return res.json();
  } catch (error) {
    // Network errors (backend not running)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to backend server. Make sure it\'s running on http://localhost:4000');
    }
    throw error;
  }
};
