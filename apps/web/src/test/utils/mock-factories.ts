/**
 * Mock Factories - Create reusable mocks for common patterns
 */

import { vi } from 'vitest';

/**
 * Create a Supabase mock
 */
export const createSupabaseMock = () => {
  const mockGetSession = vi.fn().mockResolvedValue({ 
    data: { session: null } 
  });
  const mockOnAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } }
  }));
  
  return {
    supabase: {
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: mockOnAuthStateChange
      }
    },
    mockGetSession,
    mockOnAuthStateChange
  };
};

/**
 * Create a fetch mock factory
 */
export const createFetchMock = (responses: Record<string, any>) => {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.includes('http') ? new URL(url).pathname : url;
    
    for (const [pattern, response] of Object.entries(responses)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(response),
          text: () => Promise.resolve(JSON.stringify(response))
        });
      }
    }
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}')
    });
  });
};

/**
 * Create an error response mock
 */
export const createErrorResponse = (status: number, message: string) => {
  return Promise.resolve({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(JSON.stringify({ error: message }))
  });
};

