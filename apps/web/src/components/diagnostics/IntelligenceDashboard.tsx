// =====================================================
// INTELLIGENCE HEALTH DASHBOARD
// Phase 4 — Observe Reality
// Admin/builder facing. Not shown in main navigation.
// Access at /intelligence
// =====================================================

import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type FunnelStage = { stage: string; count: number; pct: number };
type Warning = { level: 'critical' | 'warning' | 'info'; system: string; message: string; actual: number; threshold: number };

interface HealthData {
  observed_at: string;
  summary: {
    total_messages: number;
    total_resolved_events: number;
    linkage_pct: number;
    ingestion_coverage_pct: number;
    meaning_density_pct: number;
    overall_health: 'healthy' | 'degraded' | 'critical';
  };
  event_pipeline: {
    conversation_messages: { total: number; last_24h: number; last_7d: number; user_only_total: number };
    experience_ingestion:  { total: number; last_24h: number; last_7d: number; coverage_pct: number };
    resolved_events:       { total: number; last_24h: number; last_7d: number };
    event_records:         { total: number; last_24h: number; last_7d: number; linked: number; linkage_pct: number };
  };
  meaning_layer: {
    event_emotions:         { total: number; last_24h: number; last_7d: number };
    event_cognitions:       { total: number; last_24h: number; last_7d: number };
    event_identity_impacts: { total: number; last_24h: number; last_7d: number };
    narrative_accounts:     { total: number; last_24h: number; last_7d: number; at_the_time: number; looking_back: number };
    records_with_meaning: number;
    meaning_density_pct: number;
  };
  story_layer: {
    causal_links:     { total: number; last_24h: number; last_7d: number };
    continuity_links: { total: number; last_24h: number; last_7d: number; expected: number; health_pct: number };
    recurring_scenes: { total: number; surfaceable_at_2plus: number };
    confidence_snaps: { total: number; last_24h: number; last_7d: number };
    event_impacts:    { total: number; last_24h: number };
  };
  knowledge_layer: {
    omega_claims:  { total: number; active: number; inactive: number };
    omega_entities:{ total: number };
    crystallized:  { total: number };
  };
  funnel: FunnelStage[];
  warnings: Warning[];
  thresholds: Record<string, number>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const HealthBadge = ({ health }: { health: string }) => {
  const cfg = {
    healthy:  { label: 'Healthy',  bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    degraded: { label: 'Degraded', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    critical: { label: 'Critical', bg: 'bg-red-500/20 text-red-300 border-red-500/40' },
  }[health] ?? { label: health, bg: 'bg-white/10 text-white/60 border-white/20' };
  return (
    <span className={`px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
};

const StatRow = ({ label, total, h24, h7d }: { label: string; total: number; h24: number; h7d: number }) => (
  <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
    <span className="text-sm text-white/70">{label}</span>
    <div className="flex items-center gap-5 text-right">
      <div className="w-16">
        <p className="text-[10px] text-white/35 uppercase tracking-wider">24h</p>
        <p className="text-sm font-mono font-semibold text-white/80">{h24.toLocaleString()}</p>
      </div>
      <div className="w-16">
        <p className="text-[10px] text-white/35 uppercase tracking-wider">7d</p>
        <p className="text-sm font-mono font-semibold text-white/80">{h7d.toLocaleString()}</p>
      </div>
      <div className="w-20">
        <p className="text-[10px] text-white/35 uppercase tracking-wider">Total</p>
        <p className="text-base font-mono font-bold text-white">{total.toLocaleString()}</p>
      </div>
    </div>
  </div>
);

const PctBar = ({ pct, threshold, label }: { pct: number; threshold?: number; label: string }) => {
  const color = threshold === undefined ? 'bg-primary/60'
    : pct >= threshold ? 'bg-emerald-400/70'
    : pct >= threshold * 0.6 ? 'bg-amber-400/70'
    : 'bg-red-400/70';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/55">{label}</span>
        <span className={`font-bold font-mono ${pct === 0 ? 'text-white/30' : pct >= (threshold ?? 50) ? 'text-emerald-300' : 'text-amber-300'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {threshold !== undefined && (
        <p className="text-[9px] text-white/25">threshold: {threshold}%</p>
      )}
    </div>
  );
};

const SectionCard = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div className="bg-white/4 border border-white/10 rounded-xl p-5">
    <h3 className="text-xs font-bold text-white/55 uppercase tracking-widest mb-4 flex items-center gap-2">
      <span>{icon}</span>{title}
    </h3>
    {children}
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const IntelligenceDashboard: React.FC = () => {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<HealthData & { success: boolean }>('/api/diagnostics/intelligence-health');
      setData(result);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load intelligence health data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-white/40">Querying production intelligence…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">Failed to load</p>
          <p className="text-sm text-white/40">{error}</p>
          <button type="button" onClick={() => void load()}
            className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/60 hover:text-white hover:border-white/30 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, event_pipeline, meaning_layer, story_layer, knowledge_layer, funnel, warnings } = data;

  const warningColors = { critical: 'border-red-500/40 bg-red-500/8 text-red-300', warning: 'border-amber-500/40 bg-amber-500/8 text-amber-300', info: 'border-blue-500/40 bg-blue-500/8 text-blue-300' };
  const warningIcons  = { critical: '⚠', warning: '△', info: 'ℹ' };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-primary/70">◈</span>
            Intelligence Health Dashboard
          </h1>
          <p className="text-xs text-white/35 mt-1">Phase 4 — Observe Reality · Admin only · Not user-facing</p>
        </div>
        <div className="flex items-center gap-3">
          <HealthBadge health={summary.overall_health} />
          <button type="button" onClick={() => void load()} disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-white/15 text-xs text-white/50 hover:text-white hover:border-white/30 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {lastRefresh && (
        <p className="text-[10px] text-white/25">
          Observed at {lastRefresh.toLocaleTimeString()} · {new Date(data.observed_at).toLocaleDateString()}
        </p>
      )}

      {/* ── Warnings ── */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${warningColors[w.level]}`}>
              <span className="text-sm font-bold flex-shrink-0 mt-0.5">{warningIcons[w.level]}</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-0.5 opacity-70">{w.system}</p>
                <p className="text-sm leading-snug">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Messages',        value: summary.total_messages,            unit: 'total' },
          { label: 'Events',          value: summary.total_resolved_events,     unit: 'resolved' },
          { label: 'Ingestion Cover', value: summary.ingestion_coverage_pct,    unit: '%' },
          { label: 'Linkage',         value: summary.linkage_pct,               unit: '%' },
          { label: 'Meaning Density', value: summary.meaning_density_pct,       unit: '%' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white/4 border border-white/10 rounded-xl p-4 text-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold font-mono text-white">{kpi.value.toLocaleString()}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{kpi.unit}</p>
          </div>
        ))}
      </div>

      {/* ── Pipeline Funnel ── */}
      <SectionCard title="Pipeline Funnel" icon="⟶">
        <p className="text-xs text-white/35 mb-4">Conversion at each stage. Find where intelligence dies.</p>
        <div className="space-y-3">
          {funnel.map((stage, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-44 shrink-0">
                <p className="text-xs text-white/65 truncate">{stage.stage}</p>
              </div>
              <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${stage.pct === 0 ? 'bg-white/15' : stage.pct >= 60 ? 'bg-emerald-400/60' : stage.pct >= 30 ? 'bg-amber-400/60' : 'bg-red-400/60'}`}
                  style={{ width: `${Math.min(100, stage.pct)}%` }}
                />
              </div>
              <div className="w-24 shrink-0 text-right flex items-center justify-end gap-2">
                <span className="text-[10px] font-mono text-white/45">{stage.count.toLocaleString()}</span>
                <span className={`text-xs font-bold font-mono ${stage.pct === 0 ? 'text-white/25' : stage.pct >= 60 ? 'text-emerald-300' : stage.pct >= 30 ? 'text-amber-300' : 'text-red-300'}`}>
                  {stage.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Detail Sections ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Event Pipeline */}
        <SectionCard title="Event Pipeline" icon="↓">
          <StatRow label="User messages" total={event_pipeline.conversation_messages.user_only_total} h24={event_pipeline.conversation_messages.last_24h} h7d={event_pipeline.conversation_messages.last_7d} />
          <StatRow label="EXPERIENCE_INGESTION" total={event_pipeline.experience_ingestion.total} h24={event_pipeline.experience_ingestion.last_24h} h7d={event_pipeline.experience_ingestion.last_7d} />
          <StatRow label="Resolved events" total={event_pipeline.resolved_events.total} h24={event_pipeline.resolved_events.last_24h} h7d={event_pipeline.resolved_events.last_7d} />
          <StatRow label="Event records" total={event_pipeline.event_records.total} h24={event_pipeline.event_records.last_24h} h7d={event_pipeline.event_records.last_7d} />
          <div className="mt-4 space-y-3">
            <PctBar pct={event_pipeline.experience_ingestion.coverage_pct} threshold={30} label="Ingestion coverage" />
            <PctBar pct={event_pipeline.event_records.linkage_pct} threshold={60} label="Record linkage" />
          </div>
        </SectionCard>

        {/* Meaning Layer */}
        <SectionCard title="Meaning Layer" icon="♡">
          <StatRow label="Narratives" total={meaning_layer.narrative_accounts.total} h24={meaning_layer.narrative_accounts.last_24h} h7d={meaning_layer.narrative_accounts.last_7d} />
          <StatRow label="Emotions" total={meaning_layer.event_emotions.total} h24={meaning_layer.event_emotions.last_24h} h7d={meaning_layer.event_emotions.last_7d} />
          <StatRow label="Cognitions" total={meaning_layer.event_cognitions.total} h24={meaning_layer.event_cognitions.last_24h} h7d={meaning_layer.event_cognitions.last_7d} />
          <StatRow label="Identity impacts" total={meaning_layer.event_identity_impacts.total} h24={meaning_layer.event_identity_impacts.last_24h} h7d={meaning_layer.event_identity_impacts.last_7d} />
          <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between text-xs">
            <span className="text-white/40">At the time / Looking back</span>
            <span className="font-mono text-white/70">
              {meaning_layer.narrative_accounts.at_the_time} / {meaning_layer.narrative_accounts.looking_back}
            </span>
          </div>
          <div className="mt-4">
            <PctBar pct={meaning_layer.meaning_density_pct} threshold={40} label="Meaning density (records with emotions)" />
          </div>
        </SectionCard>

        {/* Story Layer */}
        <SectionCard title="Story Layer" icon="◈">
          <StatRow label="Causal links" total={story_layer.causal_links.total} h24={story_layer.causal_links.last_24h} h7d={story_layer.causal_links.last_7d} />
          <StatRow label="Continuity links" total={story_layer.continuity_links.total} h24={story_layer.continuity_links.last_24h} h7d={story_layer.continuity_links.last_7d} />
          <StatRow label="Confidence snapshots" total={story_layer.confidence_snaps.total} h24={story_layer.confidence_snaps.last_24h} h7d={story_layer.confidence_snaps.last_7d} />
          <StatRow label="Event impacts" total={story_layer.event_impacts.total} h24={story_layer.event_impacts.last_24h} h7d={0} />
          <div className="mt-3 pt-3 border-t border-white/8 flex items-center justify-between text-xs">
            <span className="text-white/40">Recurring scenes (total / surfaceable)</span>
            <span className="font-mono text-white/70">
              {story_layer.recurring_scenes.total} / {story_layer.recurring_scenes.surfaceable_at_2plus}
            </span>
          </div>
          <div className="mt-4">
            <PctBar
              pct={story_layer.continuity_links.health_pct}
              threshold={50}
              label={`Continuity health (${story_layer.continuity_links.total} actual / ${story_layer.continuity_links.expected} expected)`}
            />
          </div>
        </SectionCard>

        {/* Knowledge Layer */}
        <SectionCard title="Knowledge Layer" icon="◎">
          <div className="space-y-3">
            {[
              { label: 'Omega claims (total)',    value: knowledge_layer.omega_claims.total },
              { label: 'Omega claims (active)',   value: knowledge_layer.omega_claims.active },
              { label: 'Omega claims (inactive)', value: knowledge_layer.omega_claims.inactive },
              { label: 'Omega entities',          value: knowledge_layer.omega_entities.total },
              { label: 'Crystallized knowledge',  value: knowledge_layer.crystallized.total },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <span className="text-sm text-white/65">{row.label}</span>
                <span className="text-sm font-mono font-bold text-white">{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {knowledge_layer.omega_claims.total > 0 && (
            <div className="mt-4">
              <PctBar
                pct={Math.round(knowledge_layer.omega_claims.active / knowledge_layer.omega_claims.total * 100)}
                label="Active claims ratio"
              />
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Next Bottleneck ── */}
      <div className="bg-white/4 border border-white/10 rounded-xl p-5">
        <h3 className="text-xs font-bold text-white/55 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>→</span> Decision Gate
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className={`p-3 rounded-lg border ${event_pipeline.experience_ingestion.coverage_pct < 30 && event_pipeline.conversation_messages.user_only_total > 0 ? 'border-red-500/30 bg-red-500/8' : 'border-white/10 bg-white/3'}`}>
            <p className="font-bold text-white/60 uppercase tracking-wider mb-1">A — Mode Router</p>
            <p className="text-white/45">If ingestion coverage &lt; 30% with real data → calibrate EXPERIENCE_INGESTION thresholds</p>
            <p className="mt-1 font-mono text-white/70">Now: {event_pipeline.experience_ingestion.coverage_pct}%</p>
          </div>
          <div className={`p-3 rounded-lg border ${event_pipeline.event_records.linkage_pct < 60 && event_pipeline.event_records.total > 0 ? 'border-amber-500/30 bg-amber-500/8' : 'border-white/10 bg-white/3'}`}>
            <p className="font-bold text-white/60 uppercase tracking-wider mb-1">B — Retrieval Switch</p>
            <p className="text-white/45">If linkage ≥ 70% → safe to flip Phase C3 (FK retrieval over date join)</p>
            <p className="mt-1 font-mono text-white/70">Now: {event_pipeline.event_records.linkage_pct}%</p>
          </div>
          <div className={`p-3 rounded-lg border ${event_pipeline.resolved_events.total === 0 ? 'border-blue-500/30 bg-blue-500/8' : 'border-white/10 bg-white/3'}`}>
            <p className="font-bold text-white/60 uppercase tracking-wider mb-1">C — Data Volume</p>
            <p className="text-white/45">If events = 0 after real conversations → pipeline entry point blocked upstream</p>
            <p className="mt-1 font-mono text-white/70">Now: {event_pipeline.resolved_events.total} events</p>
          </div>
        </div>
      </div>

    </div>
  );
};
