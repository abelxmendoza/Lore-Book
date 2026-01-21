import { useMemo, useState } from 'react';
import { AlarmClock, ArrowRight, CalendarDays, CheckCircle2, ListChecks, PlugZap, Sparkles, Target } from 'lucide-react';

import type { TaskBriefing, TaskEvent, TaskRecord } from '../hooks/useTaskEngine';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type Props = {
  tasks: TaskRecord[];
  events: TaskEvent[];
  briefing: TaskBriefing;
  onCreate: (payload: { title: string; description?: string; dueDate?: string | null }) => Promise<unknown>;
  onComplete: (taskId: string) => Promise<unknown>;
  onDelete: (taskId: string) => Promise<unknown>;
  onChatCommand: (message: string) => Promise<{ created: TaskRecord[]; commands: string[] }>;
  onSync: (accessToken: string) => Promise<{ imported: number; total: number }>;
  loading?: boolean;
};

const priorityColor = (priority: number) => {
  if (priority >= 7) return 'bg-red-500/20 text-red-200 border border-red-500/50';
  if (priority >= 5) return 'bg-orange-500/20 text-orange-200 border border-orange-500/50';
  return 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40';
};

export const TaskEnginePanel = ({
  tasks,
  events,
  briefing,
  onCreate,
  onComplete,
  onDelete,
  onChatCommand,
  onSync,
  loading
}: Props) => {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status === 'incomplete').sort((a, b) => b.priority - a.priority),
    [tasks]
  );

  const handleCreate = async () => {
    if (!title.trim()) return;
    await onCreate({ title, dueDate: dueDate ? new Date(dueDate).toISOString() : null });
    setTitle('');
    setDueDate('');
  };

  const handleChat = async () => {
    if (!chatMessage.trim()) return;
    const result = await onChatCommand(chatMessage);
    setStatus(
      result.commands.length
        ? `Captured ${result.created.length} task(s); commands: ${result.commands.join(', ')}`
        : `Captured ${result.created.length} task(s) from chat`
    );
    setChatMessage('');
  };

  const handleSync = async () => {
    if (!accessToken.trim()) return;
    const summary = await onSync(accessToken.trim());
    setStatus(`Synced Microsoft To Do (${summary.imported}/${summary.total})`);
    setAccessToken('');
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-black/40 p-5 shadow-panel">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-white/50">Task Engine</p>
          <h3 className="text-lg font-semibold text-white">LoreKeeper Tasks</h3>
          <p className="text-xs text-white/40">Auto-capture tasks from chat, MS To Do, and priority rules.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/20 text-primary">{activeTasks.length} open</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const route = '/quests';
              window.location.href = route;
            }}
            className="text-xs"
          >
            <Target className="h-3 w-3 mr-1" />
            Quests
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-border/60 bg-black/60 p-3">
          <p className="text-xs uppercase text-white/50">Quick Add</p>
          <div className="mt-2 flex flex-col gap-2">
            <Input
              placeholder="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="bg-black/60"
            />
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="bg-black/60" />
            <Button disabled={!title || loading} onClick={handleCreate} leftIcon={<ListChecks className="h-4 w-4" />}>
              Create Task
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-black/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase text-white/50">Chat Commands</p>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <Textarea
            value={chatMessage}
            onChange={(event) => setChatMessage(event.target.value)}
            placeholder="“Tomorrow I need to lift and finish that BJJ assignment” will create two tasks."
            className="mt-2 bg-black/60"
          />
          <Button className="mt-2" variant="secondary" onClick={handleChat} disabled={!chatMessage || loading}>
            Parse Chat
          </Button>
        </div>

        <div className="rounded-xl border border-border/60 bg-black/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase text-white/50">Microsoft To Do</p>
            <PlugZap className="h-4 w-4 text-primary" />
          </div>
          <Input
            placeholder="Paste delegated access token to import"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            className="mt-2 bg-black/60"
          />
          <Button className="mt-2" variant="outline" onClick={handleSync} disabled={!accessToken || loading}>
            Sync Tasks
          </Button>
        </div>

        {status && <p className="text-xs text-emerald-300">{status}</p>}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-black/60 p-3">
          <div className="flex items-center gap-2 text-white/70">
            <AlarmClock className="h-4 w-4 text-primary" />
            <p className="text-xs uppercase">Due Soon</p>
          </div>
          <div className="mt-2 space-y-2">
            {briefing.dueSoon.length === 0 && <p className="text-xs text-white/50">No urgent tasks.</p>}
            {briefing.dueSoon.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-border/50 p-2">
                <div>
                  <p className="text-sm text-white">{task.title}</p>
                  {task.due_date && <p className="text-[10px] text-white/50">{new Date(task.due_date).toLocaleDateString()}</p>}
                </div>
                <Badge className={priorityColor(task.priority)}>P{task.priority}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-black/60 p-3">
          <div className="flex items-center gap-2 text-white/70">
            <CalendarDays className="h-4 w-4 text-primary" />
            <p className="text-xs uppercase">Inbox</p>
          </div>
          <div className="mt-2 space-y-2">
            {briefing.inbox.length === 0 && <p className="text-xs text-white/50">No backlog without due dates.</p>}
            {briefing.inbox.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border border-border/50 p-2">
                <p className="text-sm text-white">{task.title}</p>
                <Badge className={priorityColor(task.priority)}>P{task.priority}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-center gap-2 text-white/70">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <p className="text-xs uppercase">Active Queue</p>
        </div>
        {activeTasks.slice(0, 6).map((task) => (
          <div key={task.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-black/60 p-3">
            <div>
              <p className="text-sm font-medium text-white">{task.title}</p>
              <div className="flex items-center gap-2 text-[11px] text-white/50">
                <span className="capitalize">{task.category}</span>
                {task.due_date && <span>{new Date(task.due_date).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={priorityColor(task.priority)}>P{task.priority}</Badge>
              <Button size="xs" variant="ghost" onClick={() => onComplete(task.id)}>
                Done
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onDelete(task.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border/60 bg-black/60 p-3">
        <div className="flex items-center gap-2 text-white/70">
          <ArrowRight className="h-4 w-4 text-primary" />
          <p className="text-xs uppercase">Task Timeline</p>
        </div>
        <div className="mt-2 space-y-2">
          {events.slice(0, 6).map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-black/40 p-2">
              <div>
                <p className="text-sm text-white">{event.description ?? event.event_type}</p>
                <p className="text-[10px] text-white/40">{new Date(event.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="text-xs text-white/50">No task events yet.</p>}
        </div>
      </div>
    </div>
  );
};
