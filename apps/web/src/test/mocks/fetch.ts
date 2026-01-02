import { vi } from 'vitest';

// Mock fetch globally - this intercepts all fetch calls
global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  let url = typeof input === 'string' ? input : input.toString();
  
  // Handle relative URLs
  if (url.startsWith('/')) {
    url = `http://localhost:3000${url}`;
  }
  
  // Extract path from full URL
  let path = url;
  try {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  } catch {
    // If URL parsing fails, use the original string
    path = url;
  }
  
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
  if (path.includes('/api/entries') && (!init?.method || init.method === 'GET')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        entries: [{ id: '1', content: 'Test entry', date: new Date().toISOString(), tags: [], source: 'test' }],
      }),
    } as Response);
  }

  if (path.includes('/api/entries') && init?.method === 'POST') {
    let content = 'New entry';
    try {
      if (init?.body) {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        content = body.content || content;
      }
    } catch {
      // If parsing fails, use default
    }
    
    const entry = {
      id: '2',
      content,
      date: new Date().toISOString(),
      tags: [],
      source: 'test',
    };
    
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        entry, // useLoreKeeper expects { entry: ... }
      }),
    } as Response);
  }

  if (path.includes('/api/timeline') && !path.includes('/tags')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        timeline: { chapters: [], unassigned: [] },
      }),
    } as Response);
  }

  if (path.includes('/api/timeline/tags')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        tags: [],
      }),
    } as Response);
  }

  if (path.includes('/api/chapters') && (!init?.method || init.method === 'GET')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        chapters: [],
        candidates: [],
      }),
    } as Response);
  }

  if (path.includes('/api/chapters') && init?.method === 'POST') {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        chapter: {
          id: '1',
          title: 'Test Chapter',
          start_date: new Date().toISOString(),
          end_date: null,
        },
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
        characters: [{ id: '1', name: 'Test Character', role: 'Friend' }],
      }),
    } as Response);
  }

  if (path.includes('/api/health')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({ status: 'ok' }),
    } as Response);
  }

  if (path.includes('/api/summary')) {
    return Promise.resolve({
      ...mockResponse,
      json: async () => ({
        summary: 'Test summary',
        entryCount: 1,
      }),
    } as Response);
  }

  // Default response for any other endpoint
  return Promise.resolve(mockResponse as Response);
}) as typeof fetch;
