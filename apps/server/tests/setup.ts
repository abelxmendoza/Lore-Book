// Test setup file
import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true'; // Additional flag for test detection
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';

// FIX 2: Mock entity extraction globally to prevent LLM calls in tests
// This prevents request quota exhaustion and ensures deterministic tests
// Note: The test guard in extractEntities() will throw if this mock isn't set up,
// forcing tests to properly mock the method
vi.mock('../src/services/omegaMemoryService', async () => {
  const actual = await vi.importActual('../src/services/omegaMemoryService');
  // Get the actual instance
  const actualInstance = (actual as any).omegaMemoryService;
  
  // Create a spy on extractEntities that returns empty array by default
  // Individual tests can override with: vi.mocked(omegaMemoryService.extractEntities).mockResolvedValue([...])
  const mockExtractEntities = vi.fn().mockResolvedValue([]);
  
  return {
    ...actual,
    omegaMemoryService: {
      ...actualInstance,
      extractEntities: mockExtractEntities,
    },
  };
});

beforeAll(() => {
  // Setup before all tests
});

afterAll(() => {
  // Cleanup after all tests
});

