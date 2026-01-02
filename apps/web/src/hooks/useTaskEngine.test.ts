import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskEngine } from './useTaskEngine';

// Mock fetch
global.fetch = vi.fn();

describe('useTaskEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure fetch is a mock function
    global.fetch = vi.fn() as any;
    // Setup default fetch mock
    (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/tasks') && !url.includes('/events') && !url.includes('/complete') && !url.includes('/from-chat') && !url.includes('/sync') && init?.method !== 'POST' && init?.method !== 'PATCH' && init?.method !== 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tasks: [] })
        });
      }
      if (url.includes('/api/tasks/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [] })
        });
      }
      if (url.includes('/api/tasks') && init?.method === 'POST' && !url.includes('/from-chat') && !url.includes('/sync')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ task: { id: 'new-task', title: 'New Task', status: 'incomplete', category: 'general', source: 'manual', priority: 0, urgency: 0, impact: 0, effort: 0 } })
        });
      }
      if (url.includes('/api/tasks') && url.includes('/complete')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ task: { id: 'task-1', title: 'Task', status: 'completed', category: 'general', source: 'manual', priority: 0, urgency: 0, impact: 0, effort: 0 } })
        });
      }
      if (url.includes('/api/tasks') && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        });
      }
      if (url.includes('/api/tasks') && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ task: { id: 'task-1', title: 'Updated Task', status: 'incomplete', category: 'general', source: 'manual', priority: 0, urgency: 0, impact: 0, effort: 0 } })
        });
      }
      if (url.includes('/api/tasks/from-chat')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ created: [], commands: [] })
        });
      }
      if (url.includes('/api/tasks/sync')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ summary: { imported: 0, total: 0 } })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });
  });

  it('should initialize with empty state', async () => {
    const { result } = renderHook(() => useTaskEngine());

    // Wait for initial load to complete
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

    // Wait for tasks to be loaded (hook calls refreshTasks on mount)
    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
      // Verify fetch was called (may be called multiple times for tasks and events)
      expect(global.fetch).toHaveBeenCalled();
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

    // First create a task
    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    // Then update it
    const updated = await result.current.updateTask(task.id, {
      title: 'Updated Task'
    });

    expect(updated.title).toBe('Updated Task');
  });

  it('should complete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    // Wait for task to be added
    await waitFor(() => {
      expect(result.current.tasks.some(t => t.id === task.id)).toBe(true);
    }, { timeout: 2000 });

    const completed = await result.current.completeTask(task.id);

    expect(completed).toBeDefined();
    expect(completed.status).toBe('completed');
  });

  it('should delete a task', async () => {
    const { result } = renderHook(() => useTaskEngine());

    const task = await result.current.createTask({
      title: 'Task',
      category: 'general'
    });

    await result.current.deleteTask(task.id);

    // Task should be removed from list
    expect(result.current.tasks.find(t => t.id === task.id)).toBeUndefined();
  });

  it('should refresh tasks', async () => {
    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.tasks).toBeDefined();
    }, { timeout: 2000 });

    await result.current.refreshTasks();

    // Verify fetch was called (may have been called multiple times)
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should refresh events', async () => {
    const { result } = renderHook(() => useTaskEngine());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.events).toBeDefined();
    }, { timeout: 2000 });

    // Clear previous calls
    vi.clearAllMocks();

    await result.current.refreshEvents();

    // Verify fetch was called for events
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/events'),
      expect.any(Object)
    );
  });

  it('should process chat message', async () => {
    const { result } = renderHook(() => useTaskEngine());

    const response = await result.current.processChat('Create a task to test');

    expect(response).toBeDefined();
    expect(response.created).toBeDefined();
    expect(response.commands).toBeDefined();
  });

  it.skip('should calculate briefing correctly', async () => {
    // Mock tasks with different statuses and dates
    const mockTasks = [
      {
        id: '1',
        title: 'Due Soon',
        status: 'incomplete' as const,
        category: 'general',
        source: 'manual',
        priority: 0,
        urgency: 0,
        impact: 0,
        effort: 0,
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days from now
      },
      {
        id: '2',
        title: 'Overdue',
        status: 'incomplete' as const,
        category: 'general',
        source: 'manual',
        priority: 0,
        urgency: 0,
        impact: 0,
        effort: 0,
        due_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      },
      {
        id: '3',
        title: 'Inbox',
        status: 'incomplete' as const,
        category: 'general',
        source: 'manual',
        priority: 0,
        urgency: 0,
        impact: 0,
        effort: 0
      },
      {
        id: '4',
        title: 'Completed',
        status: 'completed' as const,
        category: 'general',
        source: 'manual',
        priority: 0,
        urgency: 0,
        impact: 0,
        effort: 0,
        updated_at: new Date().toISOString()
      }
    ];

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/tasks') && !url.includes('/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tasks: mockTasks })
        });
      }
      if (url.includes('/api/tasks/events')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      });
    });

    const { result } = renderHook(() => useTaskEngine());

    await waitFor(() => {
      expect(result.current.briefing).toBeDefined();
      expect(result.current.briefing.dueSoon).toBeDefined();
      expect(result.current.briefing.overdue).toBeDefined();
      expect(result.current.briefing.inbox).toBeDefined();
    }, { timeout: 3000 });
  });
});

