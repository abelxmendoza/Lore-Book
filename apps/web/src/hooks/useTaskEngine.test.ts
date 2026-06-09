import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskEngine } from './useTaskEngine';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } })
    }
  },
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false }))
}));

const mockFetchJson = vi.fn();
vi.mock('../lib/api', () => ({
  fetchJson: (...args: unknown[]) => mockFetchJson(...args)
}));

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${Date.now()}-${Math.random()}`,
    title: 'Task',
    status: 'incomplete',
    category: 'general',
    source: 'manual',
    priority: 0,
    urgency: 0,
    impact: 0,
    effort: 0,
    ...overrides,
  };
}

function defaultMock(url: string, init?: { method?: string; body?: string }) {
  const method = init?.method ?? 'GET';

  if (url === '/api/tasks' && method === 'GET')
    return Promise.resolve({ tasks: [] });

  if (url === '/api/tasks/events')
    return Promise.resolve({ events: [] });

  if (url === '/api/tasks' && method === 'POST') {
    const body = init?.body ? JSON.parse(init.body) : {};
    return Promise.resolve({ task: makeTask({ title: body.title || 'New Task', category: body.category || 'general' }) });
  }

  if (/^\/api\/tasks\/[^/]+\/complete$/.test(url) && method === 'POST') {
    const taskId = url.match(/\/api\/tasks\/([^/]+)\/complete/)?.[1] ?? 'unknown';
    return Promise.resolve({ task: makeTask({ id: taskId, status: 'completed' }) });
  }

  if (/^\/api\/tasks\/[^/]+$/.test(url) && method === 'DELETE')
    return Promise.resolve({});

  if (/^\/api\/tasks\/[^/]+$/.test(url) && method === 'PATCH') {
    const taskId = url.match(/\/api\/tasks\/([^/]+)/)?.[1] ?? 'unknown';
    const body = init?.body ? JSON.parse(init.body) : {};
    return Promise.resolve({ task: makeTask({ id: taskId, title: body.title || 'Updated Task' }) });
  }

  if (url === '/api/tasks/from-chat')
    return Promise.resolve({ created: [], commands: [] });

  return Promise.resolve({});
}

describe('useTaskEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockImplementation((url: string, init?: { method?: string; body?: string }) =>
      defaultMock(url, init)
    );
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
      expect(mockFetchJson).toHaveBeenCalled();
    }, { timeout: 3000 });
    expect(result.current.tasks).toBeDefined();
  });

  it('should create a new task', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    const newTask = await result.current.createTask({ title: 'New Task', category: 'general' });
    expect(newTask).toBeDefined();
    expect(newTask.title).toBe('New Task');
  });

  it('should update a task', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    const task = await result.current.createTask({ title: 'Task', category: 'general' });
    const updated = await result.current.updateTask(task.id, { title: 'Updated Task' });
    expect(updated.title).toBe('Updated Task');
  });

  it('should complete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    const task = await result.current.createTask({ title: 'Task', category: 'general' });
    const completed = await result.current.completeTask(task.id);
    expect(completed).toBeDefined();
    expect(completed.status).toBe('completed');
  });

  it('should delete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });

    const task = await result.current.createTask({ title: 'Task', category: 'general' });
    await waitFor(() => expect(result.current.tasks.some(t => t.id === task.id)).toBe(true), { timeout: 2000 });

    await result.current.deleteTask(task.id);
    await waitFor(() => expect(result.current.tasks.find(t => t.id === task.id)).toBeUndefined(), { timeout: 2000 });
  });

  it('should refresh tasks', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.tasks).toBeDefined(), { timeout: 2000 });
    await result.current.refreshTasks();
    expect(mockFetchJson).toHaveBeenCalled();
  });

  it('should refresh events', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.events).toBeDefined(), { timeout: 2000 });
    await result.current.refreshEvents();
    expect(mockFetchJson).toHaveBeenCalled();
  });

  it('should process chat message', async () => {
    const { result } = renderHook(() => useTaskEngine());
    await waitFor(() => expect(result.current.tasks).toBeDefined(), { timeout: 2000 });
    const response = await result.current.processChat('Create a task to test');
    expect(response).toBeDefined();
    expect(response.created).toBeDefined();
    expect(response.commands).toBeDefined();
  });

  it.skip('should calculate briefing correctly', async () => {
    // Needs date mocking — skip for now
  });
});
