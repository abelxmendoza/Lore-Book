import { vi } from 'vitest';

// Mock fetch globally - this intercepts all fetch calls
global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  
  // Extract path from full URL
  const urlObj = new URL(url, 'http://localhost:3000');
  const path = urlObj.pathname;
  
  // Default mock response
  const mockResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
    headers: new Headers(),
  };

  // Handle different endpoints (match by path, not full URL)
  if (path.includes('/api/entries')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        entries: [],
      }),
    } as Response);
  }

  if (path.includes('/api/timeline')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        timeline: [],
      }),
    } as Response);
  }

  if (path.includes('/api/chapters')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        chapters: [],
      }),
    } as Response);
  }

  if (path.includes('/api/evolution')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        evolution: [],
      }),
    } as Response);
  }

  if (path.includes('/api/tags')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        tags: [],
      }),
    } as Response);
  }

  if (path.includes('/api/time/timezone')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        timezone: 'UTC',
      }),
    } as Response);
  }

  if (path.includes('/api/characters')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        characters: [],
      }),
    } as Response);
  }

  // Default response for any other endpoint
  return Promise.resolve(mockResponse as Response);
}) as typeof fetch;
