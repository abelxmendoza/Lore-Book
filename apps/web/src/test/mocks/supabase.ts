import { vi } from 'vitest';

export const mockSupabase = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: null,
      },
      error: null,
    }),
    signInWithOtp: vi.fn().mockResolvedValue({
      data: {},
      error: null,
    }),
    signInWithOAuth: vi.fn().mockResolvedValue({
      data: {},
      error: null,
    }),
    onAuthStateChange: vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
};

vi.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: () => true,
  getConfigDebug: () => ({
    url: 'https://test.supabase.co',
    keyPresent: true,
    issues: [],
  }),
}));
