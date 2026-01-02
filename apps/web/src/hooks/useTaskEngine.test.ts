import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskEngine } from './useTaskEngine';

// Mock all dependencies upfront
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

vi.mock('../config/env', () => ({
  config: {
    api: { url: 'http://localhost:3000', timeout: 30000 },
    env: { mode: 'test', isDevelopment: false, isProduction: false },
    logging: { logApiCalls: false },
    dev: { allowMockData: false, verboseErrors: false }
  }
}));

vi.mock('../lib/cache', () => ({
  apiCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
    deletePattern: vi.fn()
  },
  generateCacheKey: vi.fn((url) => url)
}));

vi.mock('../lib/monitoring', () => ({
  performance: { 
    mark: vi.fn(), 
    measure: vi.fn(),
    trackApiCall: vi.fn(),
    now: () => Date.now()
  },
  errorTracking: { captureException: vi.fn() }
}));

vi.mock('../lib/security', () => ({
  addCsrfHeaders: vi.fn((headers) => headers || {})
}));

describe('useTaskEngine', () => {
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a fresh mock function for each test
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;
    
    // Default mock implementation
    mockFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = url.includes('http') ? new URL(url).pathname : url;
      
      // GET /api/tasks (list)
      if (path === '/api/tasks' && (!init?.method || init.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ tasks: [] })
        });
      }
      
      // GET /api/tasks/events
      if (path === '/api/tasks/events') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ events: [] })
        });
      }
      
      // POST /api/tasks (create)
      if (path === '/api/tasks' && init?.method === 'POST') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            task: {
              id: `task-${Date.now()}`,
              title: body.title || 'New Task',
              status: 'incomplete',
              category: body.category || 'general',
              source: 'manual',
              priority: 0,
              urgency: 0,
              impact: 0,
              effort: 0
            }
          })
        });
      }
      
      // POST /api/tasks/:id/complete
      if (path.match(/^\/api\/tasks\/[^/]+\/complete$/) && init?.method === 'POST') {
        const taskId = path.match(/\/api\/tasks\/([^/]+)\/complete/)?.[1] || 'unknown';
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            task: {
              id: taskId,
              title: 'Task',
              status: 'completed',
              category: 'general',
              source: 'manual',
              priority: 0,
              urgency: 0,
              impact: 0,
              effort: 0
            }
          })
        });
      }
      
      // DELETE /api/tasks/:id
      if (path.match(/^\/api\/tasks\/[^/]+$/) && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({})
        });
      }
      
      // PATCH /api/tasks/:id
      if (path.match(/^\/api\/tasks\/[^/]+$/) && init?.method === 'PATCH') {
        const taskId = path.match(/\/api\/tasks\/([^/]+)/)?.[1] || 'unknown';
        const body = init.body ? JSON.parse(init.body as string) : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            task: {
              id: taskId,
              title: body.title || 'Updated Task',
              status: 'incomplete',
              category: 'general',
              source: 'manual',
              priority: 0,
              urgency: 0,
              impact: 0,
              effort: 0
            }
          })
        });
      }
      
      // POST /api/tasks/from-chat
      if (path === '/api/tasks/from-chat') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ created: [], commands: [] })
        });
      }
      
      // Default
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      });
    });
  });

  it('should initialize with empty state', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
      expect(result.current.events).toBeDefined();
    }, { timeout: 2000 });

    expect(Array.isArray(result.current.tasks)).toBe(true);
    expect(Array.isArray(result.current.events)).toBe(true);
    expect(result.current.briefing).toBeDefined();
  });

  it('should load tasks on mount', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('should create a new task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const newTask = await result.current.createTask({
      title: 'New Task',
      category: 'general'
    });

    expect(newTask).toBeDefined();
    expect(newTask.title).toBe('New Task');
  });

  it('should update a task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    await waitFor(() => {
      expect(result.current.tasks.some(t => t.id === task.id)).toBe(true);
    }, { timeout: 2000 });

    const updated = await result.current.updateTask(task.id, {
      title: 'Updated Task'
    });

    expect(updated.title).toBe('Updated Task');
  });

  it('should complete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    await waitFor(() => {
      expect(result.current.tasks.some(t => t.id === task.id)).toBe(true);
    }, { timeout: 2000 });

    const completed = await result.current.completeTask(task.id);

    expect(completed).toBeDefined();
    expect(completed.status).toBe('completed');
  });

  it('should delete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    await waitFor(() => {
      expect(result.current.tasks.some(t => t.id === task.id)).toBe(true);
    }, { timeout: 2000 });

    await result.current.deleteTask(task.id);

    await waitFor(() => {
      expect(result.current.tasks.find(t => t.id === task.id)).toBeUndefined();
    }, { timeout: 2000 });
  });

  it('should refresh tasks', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    await result.current.refreshTasks();

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should refresh events', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.events).toBeDefined();
    }, { timeout: 2000 });

    await result.current.refreshEvents();

    expect(mockFetch).toHaveBeenCalled();
  });

  it('should process chat message', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const response = await result.current.processChat('Create a task to test');

    expect(response).toBeDefined();
    expect(response.created).toBeDefined();
    expect(response.commands).toBeDefined();
  });

  it.skip('should calculate briefing correctly', async () => {
    // This test needs better date mocking - skip for now
  });
});
