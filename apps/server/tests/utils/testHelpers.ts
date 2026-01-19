// =====================================================
// TEST UTILITIES
// Shared helpers for all backend tests
// =====================================================

import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a mock Supabase client
 */
export function createMockSupabaseClient(): Partial<SupabaseClient> {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
}

/**
 * Create a mock OpenAI client
 */
export function createMockOpenAIClient() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              role: 'assistant' as const,
              content: 'Mock AI response',
            },
          }],
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{
          embedding: new Array(1536).fill(0).map(() => Math.random()),
        }],
      }),
    },
  };
}

/**
 * Create a mock Express request
 */
export function createMockRequest(overrides: any = {}) {
  return {
    user: { id: 'test-user-id' },
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  };
}

/**
 * Create a mock Express response
 */
export function createMockResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock Express next function
 */
export function createMockNext() {
  return vi.fn();
}

/**
 * Wait for async operations
 */
export function waitFor(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test user data
 */
export function createTestUser(overrides: any = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    ...overrides,
  };
}

/**
 * Create test character data
 */
export function createTestCharacter(overrides: any = {}) {
  return {
    id: 'test-character-id',
    user_id: 'test-user-id',
    name: 'Test Character',
    alias: [],
    pronouns: null,
    archetype: null,
    role: null,
    status: 'active',
    first_appearance: null,
    summary: null,
    tags: [],
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create test memory entry data
 */
export function createTestMemoryEntry(overrides: any = {}) {
  return {
    id: 'test-entry-id',
    user_id: 'test-user-id',
    date: new Date().toISOString(),
    content: 'Test entry content',
    tags: [],
    chapter_id: null,
    mood: null,
    summary: null,
    source: 'manual' as const,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create test location data
 */
export function createTestLocation(overrides: any = {}) {
  return {
    id: 'test-location-id',
    user_id: 'test-user-id',
    name: 'Test Location',
    normalized_name: 'test location',
    type: null,
    latitude: null,
    longitude: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create test event data
 */
export function createTestEvent(overrides: any = {}) {
  return {
    id: 'test-event-id',
    user_id: 'test-user-id',
    title: 'Test Event',
    description: 'Test event description',
    occurred_at: new Date().toISOString(),
    type: null,
    people: [],
    locations: [],
    confidence: 0.8,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create test chapter data
 */
export function createTestChapter(overrides: any = {}) {
  return {
    id: 'test-chapter-id',
    user_id: 'test-user-id',
    title: 'Test Chapter',
    start_date: '2024-01-01',
    end_date: null,
    description: null,
    summary: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Assert response is successful
 */
export function expectSuccess(res: any, statusCode: number = 200) {
  expect(res.status).toHaveBeenCalledWith(statusCode);
  expect(res.json).toHaveBeenCalled();
}

/**
 * Assert response is an error
 */
export function expectError(res: any, statusCode: number = 400) {
  expect(res.status).toHaveBeenCalledWith(statusCode);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.any(String),
    })
  );
}
