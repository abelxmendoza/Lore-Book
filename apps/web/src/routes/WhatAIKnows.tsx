import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Brain, User, AlertCircle, CheckCircle2,
  Clock, Download, ChevronDown, ChevronRight, RefreshCw, X,
} from 'lucide-react';
import { useAuth } from '../lib/supabase';
import { fetchJson } from '../lib/api';
import { useShouldUseMockData } from '../hooks/useShouldUseMockData';

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const MOCK_DATA: WhatAIKnowsData = {
  journal_entries: [
    { id: 'mock-e1', title: 'Finished the first draft', content: "Stayed up until 3am to finish it. Relief mixed with vulnerability — putting creative work into the world is terrifying in the best way.", metadata: { truth_state: 'CANONICAL' }, created_at: ago(4) },
    { id: 'mock-e2', title: 'Morning run — week 3', content: "Three weeks of the running habit and I haven't fallen off. Something actually shifted this time. The consistency feels different.", metadata: { truth_state: 'CANONICAL' }, created_at: ago(21) },
    { id: 'mock-e3', title: 'The conversation with Maya', content: "Finally said what needed to be said. It was uncomfortable but the relief afterward was immediate.", metadata: { truth_state: 'CONTEXTUAL' }, created_at: ago(11) },
    { id: 'mock-e4', title: 'Thinking about the next 2 years', content: "Talked with Dr. Chen today. More clarity coming out of that conversation than I expected. A lot to sit with.", metadata: { truth_state: 'INFERRED' }, created_at: ago(7) },
    { id: 'mock-e5', title: 'Late night thoughts', content: "Can't sleep. Thinking about the lead role. It feels right but the anxiety is real. Writing helps.", metadata: { truth_state: 'PENDING_VERIFICATION' }, created_at: ago(48) },
  ],
  insights: [
    { id: 'mock-i1', content: "You tend to do your best creative work late at night, consistently after 10pm.", metadata: { truth_state: 'CANONICAL' }, created_at: ago(15) },
    { id: 'mock-i2', content: "Physical routines like running and cooking seem to stabilize you during periods of high creative or professional stress.", metadata: { truth_state: 'INFERRED' }, created_at: ago(20) },
    { id: 'mock-i3', content: "You often delay difficult interpersonal conversations but consistently report feeling relieved afterward.", metadata: { truth_state: 'CONTEXTUAL' }, created_at: ago(10) },
    { id: 'mock-i4', content: "Wednesdays and Thursdays are your most reflective journaling days based on entry volume and depth.", metadata: { truth_state: 'CANONICAL' }, created_at: ago(35) },
  ],
  entities: [
    { id: 'mock-ent1', canonical_name: 'Maya', type: 'PERSON', metadata: { truth_state: 'CANONICAL' }, created_at: ago(60) },
    { id: 'mock-ent2', canonical_name: 'Dr. Chen', type: 'PERSON', metadata: { truth_state: 'CANONICAL' }, created_at: ago(7) },
    { id: 'mock-ent3', canonical_name: 'Sam', type: 'PERSON', metadata: { truth_state: 'CONTEXTUAL' }, created_at: ago(45) },
    { id: 'mock-ent4', canonical_name: 'Jordan', type: 'PERSON', metadata: { truth_state: 'CANONICAL' }, created_at: ago(30) },
    { id: 'mock-ent5', canonical_name: 'Riverside Park', type: 'LOCATION', metadata: { truth_state: 'CANONICAL' }, created_at: ago(21) },
    { id: 'mock-ent6', canonical_name: 'Home Office', type: 'LOCATION', metadata: { truth_state: 'CANONICAL' }, created_at: ago(90) },
  ],
  entry_ir: [],
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TruthState = 'CANONICAL' | 'CONTEXTUAL' | 'REVISED' | 'DISPUTED' | 'INFERRED' | 'PENDING_VERIFICATION';

interface JournalEntry {
  id: string;
  title?: string;
  content?: string;
  metadata?: { truth_state?: TruthState; [key: string]: unknown };
  created_at: string;
}

interface Insight {
  id: string;
  content?: string;
  metadata?: { truth_state?: TruthState; [key: string]: unknown };
  created_at: string;
}

interface Entity {
  id: string;
  canonical_name?: string;
  type?: string;
  metadata?: { truth_state?: TruthState; [key: string]: unknown };
  created_at: string;
}

interface WhatAIKnowsData {
  journal_entries: JournalEntry[];
  insights: Insight[];
  entities: Entity[];
  entry_ir: Array<{ id: string; summary?: string; confidence?: number; metadata?: unknown; created_at: string }>;
}

interface RevisePayload {
  fromState: TruthState;
  toState: TruthState;
  artifactType: string;
  rationale?: string;
}

interface MutationRecord {
  id: string;
  artifact_type: string;
  artifact_id: string;
  mutation_type: string;
  rationale: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRUTH_STATE_COLORS: Record<TruthState, string> = {
  CANONICAL:            'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  CONTEXTUAL:           'text-sky-400 bg-sky-400/10 border-sky-400/20',
  REVISED:              'text-amber-400 bg-amber-400/10 border-amber-400/20',
  DISPUTED:             'text-rose-400 bg-rose-400/10 border-rose-400/20',
  INFERRED:             'text-violet-400 bg-violet-400/10 border-violet-400/20',
  PENDING_VERIFICATION: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
};

const TRUTH_STATE_LABELS: Record<TruthState, string> = {
  CANONICAL:            'confirmed',
  CONTEXTUAL:           'contextual',
  REVISED:              'revised',
  DISPUTED:             'disputed',
  INFERRED:             'inferred',
  PENDING_VERIFICATION: 'unverified',
};

function TruthBadge({ state }: { state: TruthState | undefined }) {
  const s = state ?? 'PENDING_VERIFICATION';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TRUTH_STATE_COLORS[s]}`}>
      {TRUTH_STATE_LABELS[s]}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── ReviseModal ──────────────────────────────────────────────────────────────

interface ReviseModalProps {
  artifactId: string;
  artifactType: string;
  currentState: TruthState;
  onClose: () => void;
  onRevised: () => void;
}

function ReviseModal({ artifactId, artifactType, currentState, onClose, onRevised }: ReviseModalProps) {
  const [permitted, setPermitted] = useState<TruthState[]>([]);
  const [toState, setToState] = useState<TruthState | ''>('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson<{ permitted: TruthState[] }>(`/api/identity/permitted-transitions?currentState=${currentState}`)
      .then(r => setPermitted(r.permitted))
      .catch(() => setPermitted([]));
  }, [currentState]);

  const submit = async () => {
    if (!toState) return;
    setSubmitting(true);
    setError('');
    try {
      await fetchJson(`/api/identity/revise/${artifactId}`, {
        method: 'POST',
        body: JSON.stringify({ fromState: currentState, toState, artifactType, rationale } satisfies RevisePayload),
      });
      onRevised();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed');
      setSubmitting(false);
    }
  };

  const needsRationale = toState === 'DISPUTED' || toState === 'REVISED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Revise truth state</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-zinc-400 text-sm mb-4">
          Currently <TruthBadge state={currentState} />. Choose the state this memory should transition to.
        </p>

        {permitted.length === 0 ? (
          <p className="text-zinc-500 text-sm">No transitions are permitted from this state.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {permitted.map(s => (
              <button
                key={s}
                onClick={() => setToState(s)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  toState === s
                    ? 'border-white/40 bg-white/10'
                    : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <TruthBadge state={s} />
                <span className="ml-2 text-zinc-300 text-sm">{s}</span>
              </button>
            ))}
          </div>
        )}

        {needsRationale && (
          <textarea
            placeholder="Explain why this memory should be revised or disputed…"
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none mb-4 focus:outline-none focus:border-zinc-400"
          />
        )}

        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!toState || submitting || (needsRationale && !rationale.trim())}
            className="px-4 py-2 text-sm bg-white text-black rounded-lg font-medium disabled:opacity-40 hover:bg-zinc-200 transition-colors"
          >
            {submitting ? 'Applying…' : 'Apply revision'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function EntryRow({ entry, onRevise }: { entry: JournalEntry; onRevise: (id: string, type: string, state: TruthState) => void }) {
  const [expanded, setExpanded] = useState(false);
  const state = entry.metadata?.truth_state ?? 'PENDING_VERIFICATION';

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
        <span className="text-white text-sm font-medium truncate flex-1">
          {entry.title ?? 'Untitled entry'}
        </span>
        <TruthBadge state={state} />
        <span className="text-zinc-500 text-xs shrink-0">{formatDate(entry.created_at)}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          {entry.content && (
            <p className="text-zinc-400 text-sm mt-3 leading-relaxed line-clamp-6">{entry.content}</p>
          )}
          <button
            onClick={() => onRevise(entry.id, 'journal_entry', state)}
            className="mt-3 text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-2"
          >
            Revise truth state
          </button>
        </div>
      )}
    </div>
  );
}

function InsightRow({ insight, onRevise }: { insight: Insight; onRevise: (id: string, type: string, state: TruthState) => void }) {
  const state = insight.metadata?.truth_state ?? 'PENDING_VERIFICATION';
  return (
    <div className="flex items-start gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50 group">
      <Brain className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-zinc-300 text-sm leading-relaxed">{insight.content ?? '—'}</p>
        <div className="flex items-center gap-2 mt-2">
          <TruthBadge state={state} />
          <span className="text-zinc-600 text-xs">{formatDate(insight.created_at)}</span>
          <button
            onClick={() => onRevise(insight.id, 'insight', state)}
            className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors underline underline-offset-2 opacity-0 group-hover:opacity-100"
          >
            revise
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityRow({ entity, onRevise }: { entity: Entity; onRevise: (id: string, type: string, state: TruthState) => void }) {
  const state = entity.metadata?.truth_state ?? 'PENDING_VERIFICATION';
  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50 group">
      <User className="w-4 h-4 text-sky-400 shrink-0" />
      <span className="text-zinc-300 text-sm flex-1 truncate">{entity.canonical_name ?? '—'}</span>
      {entity.type && <span className="text-zinc-600 text-xs">{entity.type}</span>}
      <TruthBadge state={state} />
      <button
        onClick={() => onRevise(entity.id, 'entity', state)}
        className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors underline underline-offset-2 opacity-0 group-hover:opacity-100"
      >
        revise
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatAIKnows() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMockData = useShouldUseMockData();

  const [data, setData] = useState<WhatAIKnowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'memories' | 'insights' | 'entities' | 'audit'>('memories');
  const [auditLog, setAuditLog] = useState<MutationRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [revising, setRevising] = useState<{ id: string; type: string; state: TruthState } | null>(null);

  const load = useCallback(async () => {
    if (isMockData) {
      setData(MOCK_DATA);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await fetchJson<WhatAIKnowsData>('/api/identity/what-ai-knows');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [isMockData]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isMockData || tab !== 'audit' || auditLog.length > 0) return;
    setAuditLoading(true);
    fetchJson<{ mutations: MutationRecord[] }>('/api/identity/audit-log?limit=50')
      .then(r => setAuditLog(r.mutations))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [tab, auditLog.length, isMockData]);

  const handleExport = () => {
    window.open('/api/identity/export', '_blank');
  };

  if (!user && !isMockData) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">What the AI knows about you</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Every memory, insight, and entity the system holds — and the truth state it was given.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export all
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-lg w-fit">
          {(['memories', 'insights', 'entities', 'audit'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm rounded-md transition-colors capitalize ${
                tab === t ? 'bg-white text-black font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t === 'memories' && data
                ? `memories (${data.journal_entries.length})`
                : t === 'insights' && data
                ? `insights (${data.insights.length})`
                : t === 'entities' && data
                ? `entities (${data.entities.length})`
                : t}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center gap-3 text-zinc-400 py-16 justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Reading your memory…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Memories tab */}
        {!loading && !error && tab === 'memories' && data && (
          <div className="space-y-2">
            {data.journal_entries.length === 0 ? (
              <EmptyState icon={BookOpen} message="No journal entries yet. Start writing to build your memory." />
            ) : (
              data.journal_entries.map(e => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  onRevise={(id, type, state) => setRevising({ id, type, state })}
                />
              ))
            )}
          </div>
        )}

        {/* Insights tab */}
        {!loading && !error && tab === 'insights' && data && (
          <div className="space-y-2">
            {data.insights.length === 0 ? (
              <EmptyState icon={Brain} message="No insights synthesized yet." />
            ) : (
              data.insights.map(i => (
                <InsightRow
                  key={i.id}
                  insight={i}
                  onRevise={(id, type, state) => setRevising({ id, type, state })}
                />
              ))
            )}
          </div>
        )}

        {/* Entities tab */}
        {!loading && !error && tab === 'entities' && data && (
          <div className="space-y-2">
            {data.entities.length === 0 ? (
              <EmptyState icon={User} message="No entities recognized yet." />
            ) : (
              data.entities.map(e => (
                <EntityRow
                  key={e.id}
                  entity={e}
                  onRevise={(id, type, state) => setRevising({ id, type, state })}
                />
              ))
            )}
          </div>
        )}

        {/* Audit tab */}
        {tab === 'audit' && (
          <div className="space-y-2">
            {auditLoading && (
              <div className="flex items-center gap-3 text-zinc-400 py-12 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading audit log…</span>
              </div>
            )}
            {!auditLoading && auditLog.length === 0 && (
              <EmptyState icon={CheckCircle2} message="No mutations recorded yet. Every truth-state revision will appear here." />
            )}
            {auditLog.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50">
                <Clock className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-300 text-sm font-medium">{m.mutation_type}</span>
                    <span className="text-zinc-600 text-xs">{m.artifact_type}</span>
                  </div>
                  {m.rationale && <p className="text-zinc-500 text-xs mt-1">{m.rationale}</p>}
                </div>
                <span className="text-zinc-600 text-xs shrink-0">{formatDate(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revise modal */}
      {revising && (
        <ReviseModal
          artifactId={revising.id}
          artifactType={revising.type}
          currentState={revising.state}
          onClose={() => setRevising(null)}
          onRevised={load}
        />
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
      <Icon className="w-8 h-8" />
      <p className="text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}
