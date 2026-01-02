/**
 * Test Helpers - Reusable utilities for testing
 */

import { vi } from 'vitest';

/**
 * Create a mock task
 */
export const createMockTask = (overrides?: Partial<any>) => ({
  id: `task-${Date.now()}`,
  title: 'Test Task',
  description: null,
  status: 'incomplete' as const,
  category: 'general',
  source: 'manual' as const,
  priority: 0,
  urgency: 0,
  impact: 0,
  effort: 0,
  ...overrides
});

/**
 * Create a mock entry
 */
export const createMockEntry = (overrides?: Partial<any>) => ({
  id: `entry-${Date.now()}`,
  content: 'Test entry content',
  date: new Date().toISOString(),
  tags: [],
  source: 'manual',
  ...overrides
});

/**
 * Create a mock character
 */
export const createMockCharacter = (overrides?: Partial<any>) => ({
  id: `char-${Date.now()}`,
  name: 'Test Character',
  user_id: 'user-123',
  created_at: new Date().toISOString(),
  ...overrides
});

/**
 * Setup fetch mock with default responses
 */
export const setupFetchMock = (customMocks?: Record<string, any>) => {
  global.fetch = vi.fn() as any;
  
  (global.fetch as any).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.includes('http') ? new URL(url).pathname : url;
    
    // Check custom mocks first
    if (customMocks) {
      for (const [pattern, response] of Object.entries(customMocks)) {
        if (path.includes(pattern)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(response),
            status: 200,
            statusText: 'OK'
          });
        }
      }
    }
    
    // Default responses
    if (path.includes('/api/entries') && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entries: [] }),
        status: 200
      });
    }
    
    if (path.includes('/api/tasks') && (!init?.method || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: [] }),
        status: 200
      });
    }
    
    if (path.includes('/api/timeline')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } }),
        status: 200
      });
    }
    
    // Default fallback
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      status: 200
    });
  });
};

/**
 * Wait for async state updates
 */
export const waitForState = async (condition: () => boolean, timeout = 3000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!condition()) {
    throw new Error('Condition not met within timeout');
  }
};

/**
 * Create mock user
 */
export const createMockUser = (overrides?: Partial<any>) => ({
  id: 'user-123',
  email: 'test@example.com',
  ...overrides
});

