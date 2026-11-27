import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, Flag, Milestone, NotebookPen, RefreshCw, Upload } from 'lucide-react';
import { fetchJson } from '../lib/api';

type Checkpoint = {
  id: string;
  project: string;
  agent: string;
  where_left_off: string;
  next_steps: string[];
  updated_at: string;
};

type Memory = {
  id: string;
  title: string;
  content: string;
  project: string | null;
  agent: string | null;
  updated_at: string;
};

type MilestoneRow = {
  id: string;
  track: string;
  project: string;
  highlight: string;
  occurred_at: string;
};

type Overview = { checkpoints: Checkpoint[]; memories: Memory[]; milestones: MilestoneRow[] };

const when = (iso: string) => new Date(iso).toLocaleString();

/**
 * Hivemind — one board for every AI agent the user works with.
 * Agents write here through the LoreBook MCP server (hivemind_* tools);
 * this page reads it and lets the user add a checkpoint by hand.
 * Route access is gated by server authority (canUseHivemind).
 */
export default function Hivemind() {
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ project: '', where_left_off: '', next: '' });
  const [saving, setSaving] = useState(false);
  const [importNote, setImportNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchJson<Overview>('/api/hivemind', undefined, { cache: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Hivemind');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveCheckpoint = async () => {
    if (!draft.project.trim() || !draft.where_left_off.trim()) return;
    setSaving(true);
    setError('');
    try {
      await fetchJson('/api/hivemind/checkpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: draft.project.trim(),
          agent: 'lorebook_web',
          where_left_off: draft.where_left_off.trim(),
          next_steps: draft.next.trim() ? [draft.next.trim()] : [],
        }),
      });
      setDraft({ project: '', where_left_off: '', next: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save checkpoint');
    } finally {
      setSaving(false);
    }
  };

  // Import the local agent-hivemind state file (state/hivemind_state.json).
  // Only checkpoints and milestones are read; re-importing never duplicates.
  const importStateFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setImportNote('');
    try {
      const state = JSON.parse(await file.text());
      const result = await fetchJson<{ checkpoints: number; milestonesAdded: number; milestonesSkipped: number; skippedForSecrets?: number }>(
        '/api/hivemind/import',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_tasks: state.active_tasks, career_ledger: state.career_ledger }),
        },
      );
      setImportNote(
        `Imported ${result.checkpoints} checkpoints and ${result.milestonesAdded} milestones` +
          (result.milestonesSkipped ? ` (${result.milestonesSkipped} already here)` : '') + '.' +
          (result.skippedForSecrets ? ` Skipped ${result.skippedForSecrets} that looked like they contained a secret.` : ''),
      );
      await load();
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 px-4 sm:px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center h-9 w-9 mt-0.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-violet-400" />
                <h1 className="text-xl font-semibold">Hivemind</h1>
              </div>
              <p className="text-zinc-500 text-sm mt-1">
                Where every AI agent left off, what they should all remember, and what you shipped.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label
              className="flex items-center gap-2 px-3 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-300 hover:text-white hover:border-zinc-500 cursor-pointer"
              title="Import state/hivemind_state.json from agent-hivemind"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Import agent-hivemind state file"
                onChange={(e) => { void importStateFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
            <button onClick={() => void load()} className="p-2 text-zinc-400 hover:text-white" aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        {importNote && <p className="text-sm text-emerald-300" role="status">{importNote}</p>}

        <section aria-labelledby="hm-checkpoints">
          <h2 id="hm-checkpoints" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            <Flag className="w-4 h-4" /> Where I left off
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {data?.checkpoints.map((c) => (
              <article key={c.id} className="rounded-lg border border-zinc-800 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{c.project}</h3>
                  <span className="text-xs text-zinc-500">{c.agent}</span>
                </div>
                <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{c.where_left_off}</p>
                {c.next_steps.length > 0 && (
                  <ul className="mt-2 text-sm text-violet-200 list-disc pl-5">
                    {c.next_steps.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                )}
                <p className="text-xs text-zinc-600 mt-2">{when(c.updated_at)}</p>
              </article>
            ))}
            {data && data.checkpoints.length === 0 && (
              <p className="text-sm text-zinc-500">
                No checkpoints yet. Connect an agent to the LoreBook MCP server with the Hivemind scopes, or add one below.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-zinc-800 p-4 space-y-2">
            <p className="text-sm text-zinc-400">Add a checkpoint</p>
            <input
              value={draft.project}
              onChange={(e) => setDraft({ ...draft, project: e.target.value })}
              placeholder="Project"
              aria-label="Project"
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            />
            <textarea
              value={draft.where_left_off}
              onChange={(e) => setDraft({ ...draft, where_left_off: e.target.value })}
              placeholder="Where you left off"
              aria-label="Where you left off"
              rows={2}
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            />
            <input
              value={draft.next}
              onChange={(e) => setDraft({ ...draft, next: e.target.value })}
              placeholder="Next step (optional)"
              aria-label="Next step"
              className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void saveCheckpoint()}
              disabled={saving || !draft.project.trim() || !draft.where_left_off.trim()}
              className="px-4 py-2 text-sm rounded-lg border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save checkpoint'}
            </button>
          </div>
        </section>

        <section aria-labelledby="hm-memories">
          <h2 id="hm-memories" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            <NotebookPen className="w-4 h-4" /> Shared agent memories
          </h2>
          <div className="space-y-3">
            {data?.memories.map((m) => (
              <article key={m.id} className="rounded-lg border border-zinc-800 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{m.title}</h3>
                  <span className="text-xs text-zinc-500">{m.project ?? 'all projects'}</span>
                </div>
                <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">{m.content}</p>
              </article>
            ))}
            {data && data.memories.length === 0 && <p className="text-sm text-zinc-500">No shared memories yet.</p>}
          </div>
        </section>

        <section aria-labelledby="hm-milestones">
          <h2 id="hm-milestones" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            <Milestone className="w-4 h-4" /> Milestones
          </h2>
          <ul className="space-y-2">
            {data?.milestones.map((m) => (
              <li key={m.id} className="text-sm">
                <span className="text-zinc-500">{new Date(m.occurred_at).toLocaleDateString()}</span>{' '}
                <span className="text-violet-300">[{m.project}]</span> {m.highlight}
              </li>
            ))}
            {data && data.milestones.length === 0 && <li className="text-sm text-zinc-500">No milestones yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
