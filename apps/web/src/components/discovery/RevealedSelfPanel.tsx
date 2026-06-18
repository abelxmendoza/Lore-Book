import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, TrendingUp, TrendingDown, Eye, MessageSquare, ChevronDown, ShieldCheck } from 'lucide-react';

import { fetchJson } from '../../lib/api';

type SignalType = 'value' | 'goal' | 'fear' | 'motivation' | 'identity' | 'habit' | 'preference' | 'interest' | 'skill';

interface EvidenceItem { signalType: 'stated' | 'revealed' | 'disliked'; source: 'journal' | 'chat'; sourceId: string; snippet: string; occurredAt: string | null; }
interface RevealedCategory {
  id: string; key: string; label: string; type: SignalType;
  statedCount: number; revealedCount: number; dislikedCount: number; evidenceCount: number; confidence: number;
  statedShare: number; revealedShare: number; alignmentScore: number; alignmentLabel: string;
  trend: number; sampleEvidence: EvidenceItem[];
}
interface RevealedSections { saysMatter: string[]; saysDislike: string[]; receivesTime: string[]; stronglyAligned: string[]; weaklyAligned: string[]; emerging: string[]; declining: string[]; }
interface RevealedSelfReport {
  generatedAt: string; hasData: boolean;
  totals: { stated: number; revealed: number; categories: number };
  sections: RevealedSections; categories: RevealedCategory[];
}

const TYPE_COLOR: Record<SignalType, string> = {
  value: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
  goal: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  identity: 'text-violet-300 bg-violet-500/10 border-violet-500/25',
  skill: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
  interest: 'text-teal-300 bg-teal-500/10 border-teal-500/25',
  habit: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  motivation: 'text-orange-300 bg-orange-500/10 border-orange-500/25',
  fear: 'text-red-300 bg-red-500/10 border-red-500/25',
  preference: 'text-blue-300 bg-blue-500/10 border-blue-500/25',
};

const confidenceLabel = (c: number) => (c >= 0.8 ? 'High' : c >= 0.5 ? 'Medium' : 'Emerging');

export const RevealedSelfPanel = () => {
  const [report, setReport] = useState<RevealedSelfReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchJson<RevealedSelfReport>('/api/revealed-self');
      setReport(data);
    } catch {
      setError('Could not load your revealed self. Try rescanning.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rescan = async () => {
    setRescanning(true);
    try {
      await fetchJson('/api/revealed-self/rescan', { method: 'POST' });
      await load();
    } catch {
      setError('Rescan failed.');
    } finally {
      setRescanning(false);
    }
  };

  const byKey = (k: string) => report?.categories.find((c) => c.key === k);

  if (loading) {
    return <div className="text-sm text-white/50 py-12 text-center">Reading your evidence…</div>;
  }

  if (!report || !report.hasData) {
    return (
      <div className="text-center py-16">
        <Eye className="h-10 w-10 mx-auto mb-3 text-white/15" />
        <p className="text-sm font-medium text-white/60 mb-1">Not enough evidence yet</p>
        <p className="text-xs text-white/35 mb-4">Keep journaling and chatting — your revealed self is built only from what you actually record.</p>
        <button onClick={rescan} disabled={rescanning} className="text-xs px-3 py-2 rounded-lg bg-primary/80 text-white disabled:opacity-50">
          {rescanning ? 'Scanning…' : 'Scan now'}
        </button>
      </div>
    );
  }

  const topRevealed = [...report.categories].sort((a, b) => b.revealedCount - a.revealedCount);
  const maxRevealed = Math.max(1, ...report.categories.map((c) => c.revealedCount));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Revealed Self
          </h2>
          <p className="text-xs text-white/45 mt-1 max-w-xl">
            Not what you say matters — what you <span className="text-white/70 font-medium">repeatedly do</span>.
            Built only from real episodes, every signal backed by evidence.
          </p>
        </div>
        <button onClick={rescan} disabled={rescanning}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} /> {rescanning ? 'Rescanning…' : 'Rescan'}
        </button>
      </div>

      {/* Trust banner */}
      <div className="flex items-center gap-2 text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        {report.totals.revealed} behavioral signals across {report.totals.categories} priorities — each one traceable to the episodes below.
      </div>

      {/* What actually receives your time */}
      <section>
        <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-1.5">
          <Eye className="h-4 w-4 text-primary" /> What Actually Receives Your Time
        </h3>
        <div className="space-y-2.5">
          {topRevealed.filter((c) => c.revealedCount > 0).map((c) => (
            <div key={c.id} className="rounded-xl border border-white/8 bg-black/30 overflow-hidden">
              <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="w-full text-left p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${TYPE_COLOR[c.type]}`}>{c.type}</span>
                  <span className="text-sm font-medium text-white">{c.label}</span>
                  {c.trend > 0.01 && <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
                  {c.trend < -0.01 && <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                  <span className="ml-auto text-[11px] text-white/45">{confidenceLabel(c.confidence)} · {Math.round(c.confidence * 100)}%</span>
                  <ChevronDown className={`h-4 w-4 text-white/30 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`} />
                </div>
                {/* Revealed (does) vs stated (says) bars */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Eye className="h-3 w-3 text-teal-400 shrink-0" />
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-teal-400/70 rounded-full" style={{ width: `${(c.revealedCount / maxRevealed) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-white/55 w-20 text-right">{c.revealedCount} done</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3 w-3 text-white/30 shrink-0" />
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-white/25 rounded-full" style={{ width: `${(c.statedCount / maxRevealed) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-white/35 w-20 text-right">{c.statedCount} said</span>
                  </div>
                </div>
              </button>
              {expanded === c.id && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-white/35">Evidence ({c.evidenceCount} episodes)</p>
                  {c.sampleEvidence.length === 0 && <p className="text-xs text-white/40">No sample available.</p>}
                  {c.sampleEvidence.map((e, i) => (
                    <div key={i} className="text-xs text-white/55 flex gap-2">
                      <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 h-fit ${
                        e.signalType === 'revealed' ? 'bg-teal-500/15 text-teal-300'
                          : e.signalType === 'disliked' ? 'bg-red-500/15 text-red-300'
                            : 'bg-white/10 text-white/40'
                      }`}>
                        {e.source}
                      </span>
                      <span className="italic">“{e.snippet}”</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Insight sections */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SectionList title="What You Say Matters" empty="You rarely declare priorities — you show them by doing." items={report.sections.saysMatter} byKey={byKey} metric="said" />
        <SectionList title="What You Say You Dislike" empty="No explicit dislikes recorded yet." items={report.sections.saysDislike ?? []} byKey={byKey} metric="disliked" />
        <SectionList title="Emerging Priorities" icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} empty="No clear acceleration yet." items={report.sections.emerging} byKey={byKey} metric="done" />
        <SectionList title="Weakly Aligned (say ≫ do)" empty="Nothing you talk about more than you live." items={report.sections.weaklyAligned} byKey={byKey} metric="gap" />
        <SectionList title="Declining" icon={<TrendingDown className="h-4 w-4 text-red-400" />} empty="Nothing fading right now." items={report.sections.declining} byKey={byKey} metric="done" />
      </div>

      <p className="text-[10px] text-white/25 text-center pt-2">
        Deterministic — no AI guessing. Generated {new Date(report.generatedAt).toLocaleString()}.
      </p>
    </div>
  );
};

function SectionList({ title, items, byKey, metric, empty, icon }: {
  title: string; items: string[]; metric: 'said' | 'done' | 'gap' | 'disliked';
  byKey: (k: string) => RevealedCategory | undefined; empty: string; icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <h4 className="text-xs font-semibold text-white/70 mb-2 flex items-center gap-1.5">{icon}{title}</h4>
      {items.length === 0 ? (
        <p className="text-[11px] text-white/30">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((k) => {
            const c = byKey(k);
            if (!c) return null;
            const val = metric === 'said' ? `${c.statedCount} said`
              : metric === 'disliked' ? `${c.dislikedCount ?? 0} disliked`
                : metric === 'done' ? `${c.revealedCount} done`
                  : `${c.statedCount} said · ${c.revealedCount} done`;
            return (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-white/75">{c.label}</span>
                <span className="text-white/40 text-[11px]">{val}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
