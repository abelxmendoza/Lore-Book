import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MockDataProvider } from '../contexts/MockDataContext';
import { useLoreKeeper } from './useLoreKeeper';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MockDataProvider, null, children);

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('useLoreKeeper Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fetch mock - ensure fetch is a mock function
    global.fetch = vi.fn() as any;
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/entries') && !url.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: [] })
        });
      }
      if (url.includes('/api/timeline') && !url.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } })
        });
      }
      if (url.includes('/api/timeline/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] })
        });
      }
      if (url.includes('/api/chapters')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chapters: [], candidates: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useLoreKeeper(), { wrapper });
    
    expect(result.current.entries).toEqual([]);
    // Timeline is initialized as object with chapters and unassigned arrays
    expect(result.current.timeline).toEqual({ chapters: [], unassigned: [] });
    expect(result.current.loading).toBe(false); // Loading starts as false, becomes true when fetching
  });

  it('should load entries on mount', async () => {
    // Mock entries response
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/entries') && !url.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: [{ id: '1', content: 'Test entry', date: new Date().toISOString(), tags: [], source: 'manual' }] })
        });
      }
      if (url.includes('/api/timeline') && !url.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } })
        });
      }
      if (url.includes('/api/timeline/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    // The hook calls refreshEntries on mount, which uses the mocked fetch
    // Wait for the entries to be loaded (mocked fetch returns entries)
    await waitFor(() => {
      // Entries should be loaded from the mocked API
      expect(result.current.entries.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // Verify entries were loaded
    expect(Array.isArray(result.current.entries)).toBe(true);
    expect(result.current.entries.length).toBeGreaterThan(0);
  });

  it('should create a new entry', async () => {
    const mockEntry = { id: 'new-entry', content: 'New entry', date: new Date().toISOString(), tags: [], source: 'manual' };
    const entriesList: unknown[] = [];
    
    // Mock create entry response
    (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/entries') && init?.method === 'POST') {
        // Add entry to list after creation
        entriesList.push(mockEntry);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entry: mockEntry })
        });
      }
      if (url.includes('/api/entries') && !url.includes('?')) {
        // Return current entries list
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: entriesList })
        });
      }
      if (url.includes('/api/timeline') && !url.includes('tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ timeline: { chapters: [], unassigned: [] } })
        });
      }
      if (url.includes('/api/timeline/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tags: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });

    const { result } = renderHook(() => useLoreKeeper(), { wrapper });

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.entries).toBeDefined();
    }, { timeout: 2000 });

    // Get initial entry count
    const initialCount = result.current.entries.length;

    // Create entry - the hook adds it directly to state
    const newEntry = await result.current.createEntry('New entry');

    // Verify entry was created and returned
    expect(newEntry).toBeDefined();
    expect(newEntry.content).toBe('New entry');

    // The hook adds entry directly to state: setEntries((prev) => [data.entry, ...prev])
    // So the entry should be in the list immediately
    await waitFor(() => {
      expect(result.current.entries.length).toBeGreaterThanOrEqual(initialCount);
      // Entry should be at the beginning of the list
      expect(result.current.entries[0]?.id).toBe('new-entry');
    }, { timeout: 2000 });
  });
});
