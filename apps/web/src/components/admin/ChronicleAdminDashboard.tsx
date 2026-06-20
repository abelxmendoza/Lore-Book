/**
 * LoreBook Chronicle — Admin dashboard for living project history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, Building2, Check, GitCommit, RefreshCw,
  Sparkles, Star, Target, TrendingUp, User, X,
} from 'lucide-react';
import {
  acceptChronicleDetection,
  fetchChronicle,
  formatChronicleMonth,
  rejectChronicleDetection,
  significanceStars,
  type ProjectChronicleSnapshot,
} from '../../api/chronicleAdmin';
import { getUserFriendlyMessage } from '../../lib/errorHandler';
import { FounderContact } from '../landing/FounderContact';

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function EntityCard({
  icon: Icon,
  title,
  name,
  fields,
}: {
  icon: typeof User;
  title: string;
  name: string;
  fields: Record<string, string | string[] | number>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/35">{title}</p>
          <h3 className="text-base font-semibold text-white truncate">{name}</h3>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        {Object.entries(fields).map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-white/40 text-xs capitalize">{key.replace(/([A-Z])/g, ' $1')}</dt>
            <dd className="text-white/80 mt-0.5 break-words">
              {Array.isArray(value) ? (
                <ul className="list-disc list-inside space-y-0.5 text-white/70">
                  {value.map((v) => <li key={v}>{v}</li>)}
                </ul>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StageBadge({
  stage,
  progress,
  policy,
}: {
  stage: string;
  progress: number;
  policy: ProjectChronicleSnapshot['chroniclePolicy'];
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 sm:p-5 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-primary/70 mb-2">Current Stage</p>
      <div className="flex flex-wrap items-end gap-2 sm:gap-3 mb-4">
        <span className="text-xl sm:text-2xl font-bold text-primary tracking-wide break-all sm:break-normal">{stage}</span>
        <span className="text-xs sm:text-sm text-white/50">Progress: {progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-violet-400 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-white/40 mt-2">
        Auto-records at most {policy.maxAutoPromotesPerWeek}/week when major, verified, and confident (
        ≥{Math.round(policy.minAutoPromoteConfidence * 100)}%).
      </p>
    </div>
  );
}

export const ChronicleAdminDashboard = () => {
  const [chronicle, setChronicle] = useState<ProjectChronicleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchChronicle(refresh);
      setChronicle(data);
    } catch (err) {
      setError(getUserFriendlyMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => load(false), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const timelineByMonth = useMemo(() => {
    if (!chronicle) return [];
    const map = new Map<string, typeof chronicle.milestones>();
    for (const m of chronicle.milestones) {
      const key = formatChronicleMonth(m.occurredAt);
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [chronicle]);

  const handleAccept = async (id: string) => {
    setActionId(id);
    try {
      const updated = await acceptChronicleDetection(id);
      setChronicle(updated);
    } catch (err) {
      setError(getUserFriendlyMessage(err));
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    try {
      const updated = await rejectChronicleDetection(id);
      setChronicle(updated);
    } catch (err) {
      setError(getUserFriendlyMessage(err));
    } finally {
      setActionId(null);
    }
  };

  if (loading && !chronicle) {
    return <p className="text-white/50 text-sm py-12 text-center">Loading LoreBook Chronicle…</p>;
  }

  if (!chronicle) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
        {error ?? 'Chronicle unavailable'}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 chronicle-admin min-w-0">
      {/* Header strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-white/40 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">The autobiography of LoreBook itself</span>
          </p>
          <p className="text-[10px] text-white/30 mt-1 break-words">
            Last refreshed {new Date(chronicle.lastRefreshedAt).toLocaleString()}
            · scans every {chronicle.chroniclePolicy.autoRefreshHours}h
            · major milestones only
          </p>
          {chronicle.lastAutoPromotedAt && (
            <p className="text-[10px] text-emerald-400/60 mt-0.5">
              Last auto-recorded {new Date(chronicle.lastAutoPromotedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-sm text-primary hover:bg-primary/20 transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Scan sources
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Pending detections */}
      {chronicle.pendingDetections.length > 0 && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold text-amber-200 mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Major changes awaiting review
          </h2>
          <p className="text-xs text-white/40 mb-3">
            Only significance ≥ major with verified progress appears here. Trivial work is filtered out.
          </p>
          <div className="space-y-3">
            {chronicle.pendingDetections.map((d) => (
              <div
                key={d.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-white/10 bg-black/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm break-words">{d.title}</p>
                  <p className="text-xs text-white/45 mt-0.5 break-words">{d.summary}</p>
                  <p className="text-[10px] text-white/35 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {d.source === 'git_commit' && <GitCommit className="h-3 w-3" />}
                    Confidence: {Math.round(d.confidence * 100)}%
                    · {significanceStars(d.significance)}
                    {d.verified ? (
                      <span className="text-emerald-400/90">· Verified working</span>
                    ) : (
                      <span className="text-amber-400/80">· Pending verification</span>
                    )}
                  </p>
                  {d.verificationReasons && d.verificationReasons.length > 0 && (
                    <ul className="mt-2 text-[10px] text-white/35 space-y-0.5 list-disc list-inside">
                      {d.verificationReasons.slice(0, 3).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={actionId === d.id}
                    onClick={() => handleAccept(d.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/30 transition disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={actionId === d.id}
                    onClick={() => handleReject(d.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-white/5 border border-white/15 text-white/60 text-xs hover:bg-white/10 transition disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StageBadge
          stage={chronicle.stage.current}
          progress={chronicle.stage.progressPercent}
          policy={chronicle.chroniclePolicy}
        />
        <div className="lg:col-span-2 rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2">Vision Evolution</p>
          <div className="space-y-3">
            {chronicle.visionEvolution.map((v) => (
              <div key={v.id} className="border-l-2 border-primary/40 pl-3 min-w-0">
                <p className="text-xs font-semibold text-primary/90">{v.label}</p>
                <p className="text-sm text-white/75 mt-0.5 break-words">{v.vision}</p>
                <p className="text-[10px] text-white/30 mt-1">
                  {new Date(v.recordedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entity cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EntityCard icon={User} title="Creator" name={chronicle.founder.name} fields={chronicle.founder.fields} />
        <EntityCard icon={Building2} title="Organization" name={chronicle.organization.name} fields={chronicle.organization.fields} />
        <EntityCard icon={Target} title="Product" name={chronicle.product.name} fields={chronicle.product.fields} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Timeline */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4 min-w-0">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            Timeline
          </h2>
          <div className="space-y-6 max-h-none sm:max-h-[520px] overflow-y-auto pr-0 sm:pr-1 -mx-1 px-1">
            {timelineByMonth.map(([month, items]) => (
              <div key={month}>
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">{month}</p>
                <ul className="space-y-3 border-l border-white/10 ml-2 pl-4">
                  {items.map((m) => (
                    <li key={m.id} className="relative">
                      <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-[#080510]" />
                      <p className="text-sm font-medium text-white break-words">{m.title}</p>
                      <p className="text-xs text-white/45 mt-0.5 break-words">{m.summary}</p>
                      <p className="text-[10px] text-amber-400/90 mt-1 font-medium tracking-wide">
                        {significanceStars(m.significance)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4 min-w-0">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400 shrink-0" />
            Milestone Leaderboard
          </h2>
          <ol className="space-y-2 max-h-none sm:max-h-[520px] overflow-y-auto">
            {chronicle.leaderboard.map((m, i) => (
              <li
                key={m.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition"
              >
                <span className="text-xs font-bold text-white/30 w-5 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white break-words sm:truncate">{m.title}</p>
                  <p className="text-[10px] text-amber-400/80">{significanceStars(m.significance)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Chapters + Founder stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-white mb-4">Chapters</h2>
          <div className="flex flex-wrap gap-2">
            {chronicle.chapters.map((ch) => (
              <span
                key={ch.id}
                className="px-3 py-1.5 rounded-full text-xs border border-white/15 bg-white/5 text-white/70"
              >
                {ch.title}
              </span>
            ))}
          </div>
          <p className="text-xs text-white/40 mt-3">
            Eras group milestones into narrative arcs — Idea, Memory, Identity, Narrative, Social Intelligence.
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-sm font-semibold text-white mb-4">Founder Contributions</h2>
          <p className="text-lg font-semibold text-white mb-3">{chronicle.founderStats.name}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <p className="text-white/40 text-xs">Features authored</p>
              <p className="text-xl font-bold text-white tabular-nums">{chronicle.founderStats.featuresAuthored}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <p className="text-white/40 text-xs">Major milestones</p>
              <p className="text-xl font-bold text-white tabular-nums">{chronicle.founderStats.majorMilestones}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <p className="text-white/40 text-xs">Transformational</p>
              <p className="text-xl font-bold text-white tabular-nums">{chronicle.founderStats.transformationalChanges}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <p className="text-white/40 text-xs">Vision updates</p>
              <p className="text-xl font-bold text-white tabular-nums">{chronicle.founderStats.visionUpdates}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Self narrative */}
      <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5 p-4 sm:p-5 min-w-0">
        <h2 className="text-base sm:text-lg font-bold text-white mb-1 break-words">{chronicle.selfNarrative.title}</h2>
        <p className="text-sm text-white/50 mb-4 sm:mb-5 break-words">{chronicle.selfNarrative.subtitle}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {chronicle.selfNarrative.chapters.map((ch) => (
            <article key={ch.chapterNumber} className="rounded-lg border border-white/10 bg-black/30 p-3 sm:p-4 min-w-0">
              <p className="text-[10px] text-primary/80 uppercase tracking-widest mb-1">
                Chapter {ch.chapterNumber}
              </p>
              <h3 className="font-semibold text-white mb-2">{ch.title}</h3>
              <p className="text-sm text-white/65 leading-relaxed break-words">{ch.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-black/40 p-4 sm:p-5 min-w-0">
        <p className="text-sm font-medium text-white">Abel Mendoza · Founder</p>
        <p className="text-xs text-white/45">Questions about the chronicle or LoreBook&apos;s direction?</p>
        <FounderContact variant="block" label="Email" />
      </section>
    </div>
  );
};
