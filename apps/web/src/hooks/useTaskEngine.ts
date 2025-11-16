import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';

export type TaskRecord = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  intent?: string | null;
  source: string;
  status: 'incomplete' | 'completed' | 'deleted';
  priority: number;
  urgency: number;
  impact: number;
  effort: number;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TaskEvent = {
  id: string;
  task_id: string;
  event_type: string;
  description?: string | null;
  created_at: string;
};

export type TaskBriefing = {
  dueSoon: TaskRecord[];
  overdue: TaskRecord[];
  inbox: TaskRecord[];
  completedToday: number;
};

const isWithinDays = (date?: string | null, days = 2) => {
  if (!date) return false;
  const target = new Date(date);
  const now = new Date();
  const diff = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};

export const useTaskEngine = () => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ tasks: TaskRecord[] }>('/api/tasks');
      setTasks(data.tasks ?? []);
      return data.tasks ?? [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    const data = await fetchJson<{ events: TaskEvent[] }>('/api/tasks/events');
    setEvents(data.events ?? []);
    return data.events ?? [];
  }, []);

  useEffect(() => {
    void refreshTasks();
    void refreshEvents();
  }, [refreshTasks, refreshEvents]);

  const createTask = useCallback(
    async (payload: Partial<TaskRecord> & { title: string }) => {
      const data = await fetchJson<{ task: TaskRecord }>('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setTasks((prev) => [data.task, ...prev]);
      return data.task;
    },
    []
  );

  const completeTask = useCallback(async (taskId: string) => {
    const data = await fetchJson<{ task: TaskRecord }>(`/api/tasks/${taskId}/complete`, { method: 'POST' });
    setTasks((prev) => prev.map((task) => (task.id === taskId ? data.task : task)));
    return data.task;
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    await fetchJson(`/api/tasks/${taskId}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

  const updateTask = useCallback(async (taskId: string, payload: Partial<TaskRecord>) => {
    const data = await fetchJson<{ task: TaskRecord }>(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setTasks((prev) => prev.map((task) => (task.id === taskId ? data.task : task)));
    return data.task;
  }, []);

  const processChat = useCallback(
    async (message: string) => {
      const data = await fetchJson<{ created: TaskRecord[]; commands: string[] }>('/api/tasks/from-chat', {
        method: 'POST',
        body: JSON.stringify({ message })
      });
      if (data.created?.length) {
        setTasks((prev) => [...data.created, ...prev]);
      }
      await refreshEvents();
      await refreshTasks();
      return data;
    },
    [refreshEvents, refreshTasks]
  );

  const syncMicrosoft = useCallback(async (accessToken: string, listId?: string) => {
    const data = await fetchJson<{ summary: { imported: number; total: number } }>(`/api/tasks/sync/microsoft`, {
      method: 'POST',
      body: JSON.stringify({ accessToken, listId })
    });
    await refreshTasks();
    await refreshEvents();
    return data.summary;
  }, [refreshEvents, refreshTasks]);

  const briefing = useMemo<TaskBriefing>(() => {
    const incomplete = tasks.filter((task) => task.status === 'incomplete');
    const dueSoon = incomplete.filter((task) => isWithinDays(task.due_date));
    const overdue = incomplete.filter((task) => task.due_date && new Date(task.due_date) < new Date());
    const inbox = incomplete.filter((task) => !task.due_date);
    const today = new Date().toDateString();
    const completedToday = tasks.filter(
      (task) => task.status === 'completed' && task.updated_at && new Date(task.updated_at).toDateString() === today
    ).length;

    return {
      dueSoon: dueSoon.slice(0, 5),
      overdue: overdue.slice(0, 5),
      inbox: inbox.slice(0, 5),
      completedToday
    };
  }, [tasks]);

  return {
    tasks,
    events,
    loading,
    briefing,
    refreshTasks,
    refreshEvents,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
    processChat,
    syncMicrosoft
  };
};
