import { useEffect, useState, useCallback } from 'react';
import { Scale, RefreshCw, ShieldCheck, CheckCircle2, AlertTriangle, EyeOff, ChevronDown, GitCompareArrows } from 'lucide-react';

import { fetchJson } from '../../lib/api';

interface EvidenceSample { side: 'stated' | 'revealed'; source: string; sourceId: string; snippet: string; occurredAt: string | null; }
interface ContradictionItem {
  id: string; type: string; categoryKey: string; label: string; section: string;
  statedCount: number; revealedCount: number; confidence: number; evidenceCount: number;
  severity: 'low' | 'medium' | 'high'; status: string; detail: string; evidence: EvidenceSample[];
}
interface CategoryAssessment {
  key: string; label: string; type: string; statedCount: number; revealedCount: number;
  status: 'aligned' | 'tension' | 'blind_spot' | 'insufficient'; confidence: number; sampleEvidence: EvidenceSample[];
}
interface ContradictionReport {
  generatedAt: string;
  totals: { contradictions: number; resolved: number; categories: number };
  sections: { strongAlignment: string[]; tensions: string[]; blindSpots: string[]; identityConflicts: string[]; resolved: string[] };
  contradictions: ContradictionItem[];
  assessments: CategoryAssessment[];
}

const SEV_COLOR: Record<string, string> = {
  high: 'text-red-300 bg-red-500/10 border-red-500/25',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  low: 'text-white/50 bg-white/5 border-white/15',
};

export const ContradictionsPanel = () => {
  const [report, setReport] = useState<ContradictionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await fetchJson<ContradictionReport>('/api/contradictions')); }
    catch { /* surfaced via empty state */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const redetect = async () => {
    setDetecting(true);
    try { await fetchJson('/api/contradictions/detect', { method: 'POST' }); await load(); }
    finally { setDetecting(false); }
  };

  if (loading) return <div className="text-sm text-white/50 py-12 text-center">Comparing what you say to what you do…</div>;
  if (!report) return <div className="text-sm text-white/50 py-12 text-center">No data yet.</div>;

  const byId = (id: string) => report.contradictions.find((c) => c.id === id);
  const byKey = (k: string) => report.assessments.find((a) => a.key === k);

  const Card = ({ c }: { c: ContradictionItem }) => (
    <div className="rounded-xl border border-white/8 bg-black/30 overflow-hidden">
      <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="w-full text-left p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white">{c.label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${SEV_COLOR[c.severity]}`}>{c.severity}</span>
          <span className="ml-auto text-[11px] text-white/40">{Math.round(c.confidence * 100)}% · {c.evidenceCount} episodes</span>
          <ChevronDown className={`h-4 w-4 text-white/30 transition-transform ${expanded === c.id ? 'rotate-180' : ''}`} />
        </div>
        <p className="text-xs text-white/60 leading-snug">{c.detail}</p>
      </button>
      {expanded === c.id && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-white/35">Evidence</p>
          {c.evidence.map((e, i) => (
            <div key={i} className="text-xs text-white/55 flex gap-2">
              <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 h-fit ${e.side === 'revealed' ? 'bg-teal-500/15 text-teal-300' : 'bg-white/10 text-white/40'}`}>{e.side}</span>
              <span className="italic">“{e.snippet}”</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const Section = ({ title, icon, ids, empty }: { title: string; icon: React.ReactNode; ids: string[]; empty: string }) => (
    <section>
      <h3 className="text-sm font-semibold text-white/80 mb-2.5 flex items-center gap-1.5">{icon}{title}<span className="text-white/30 text-xs font-normal">({ids.length})</span></h3>
      {ids.length === 0 ? <p className="text-[11px] text-white/30 mb-2">{empty}</p> : (
        <div className="space-y-2">{ids.map((id) => { const c = byId(id); return c ? <Card key={id} c={c} /> : null; })}</div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> Contradictions</h2>
          <p className="text-xs text-white/45 mt-1 max-w-xl">Where your stated identity and lived behavior diverge — proven from evidence, never assumed. We observe, we don't judge.</p>
        </div>
        <button onClick={redetect} disabled={detecting} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${detecting ? 'animate-spin' : ''}`} /> {detecting ? 'Re-checking…' : 'Re-check'}
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        {report.totals.contradictions} evidence-backed divergence{report.totals.contradictions === 1 ? '' : 's'} across {report.totals.categories} priorities. Each one shows its supporting episodes.
      </div>

      <Section title="Strong Alignment" icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} ids={[]} empty="Strong alignment needs both a stated value and matching action — you tend to act without declaring." />
      {report.sections.strongAlignment.length > 0 && (
        <div className="space-y-1.5 -mt-3">
          {report.sections.strongAlignment.map((k) => { const a = byKey(k); return a ? (
            <div key={k} className="flex items-center justify-between text-xs rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
              <span className="text-white/80">{a.label}</span>
              <span className="text-emerald-300/70">{a.statedCount} said · {a.revealedCount} done</span>
            </div>) : null; })}
        </div>
      )}

      <Section title="Tensions (say ≫ do)" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} ids={report.sections.tensions} empty="Nothing you talk about notably more than you live." />
      <Section title="Blind Spots (do ≫ say)" icon={<EyeOff className="h-4 w-4 text-teal-400" />} ids={report.sections.blindSpots} empty="No strong unstated priorities detected." />
      <Section title="Identity Conflicts" icon={<GitCompareArrows className="h-4 w-4 text-violet-400" />} ids={report.sections.identityConflicts} empty="No identity-vs-behavior conflicts." />
      <Section title="Resolved" icon={<CheckCircle2 className="h-4 w-4 text-white/40" />} ids={report.sections.resolved} empty="Nothing resolved yet — contradictions move here once your actions catch up to your words." />

      <p className="text-[10px] text-white/25 text-center pt-2">Deterministic — proven from evidence, explained without judgment. Generated {new Date(report.generatedAt).toLocaleString()}.</p>
    </div>
  );
};
