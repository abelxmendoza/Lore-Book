import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, Briefcase, Link2, CheckCircle2 } from 'lucide-react';
import { projectsApi, type ProjectSuggestion } from '../../api/projects';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { getMockProjectSuggestions } from '../../mocks/projectSuggestions';

interface Props {
  onProjectAdded?: () => void;
  demoMode?: boolean;
  existingProjectNames?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  software: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  career: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  fitness: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  hobby: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  creative: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
  project: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};

const typeColor = (t?: string) => TYPE_COLORS[t ?? ''] ?? 'bg-white/10 text-white/60 border-white/20';

const keyFor = (s: ProjectSuggestion) => s.id;

function evidenceQuote(s: ProjectSuggestion): string | undefined {
  const raw = s.evidence?.[0];
  if (!raw) return undefined;
  return typeof raw === 'string' ? raw : raw.text;
}

export const DetectedProjectSuggestions = ({
  onProjectAdded,
  demoMode = false,
  existingProjectNames = [],
}: Props) => {
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (opts?: { rescan?: boolean; silent?: boolean }) => {
    if (demoMode) {
      setSuggestions(getMockProjectSuggestions());
      setLoading(false);
      return;
    }
    if (opts?.rescan) setRescanning(true);
    else if (!opts?.silent) setLoading(true);
    try {
      setSuggestions(await projectsApi.getSuggestions({ rescan: opts?.rescan }));
    } catch {
      if (!opts?.silent) setSuggestions([]);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (demoMode) return;
    return onStoryDataUpdated(() => {
      void fetchSuggestions({ silent: true });
    }, 'projects');
  }, [fetchSuggestions, demoMode]);

  const existingSet = useMemo(
    () => new Set(existingProjectNames.map((n) => n.toLowerCase())),
    [existingProjectNames]
  );

  const visible = useMemo(
    () =>
      suggestions
        .filter((s) => s.name?.trim())
        .filter((s) => s.match_status !== 'existing')
        .filter((s) => !existingSet.has(s.name.trim().toLowerCase()))
        .filter((s) => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 12),
    [suggestions, dismissed, added, existingSet]
  );

  const previewExamples = useMemo(() => {
    if (demoMode || loading || rescanning || visible.length > 0) return [];
    return getMockProjectSuggestions();
  }, [demoMode, loading, rescanning, visible.length]);

  const handleAdd = async (s: ProjectSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    try {
      if (demoMode) {
        setAdded((prev) => new Set(prev).add(k));
        onProjectAdded?.();
        return;
      }
      await projectsApi.materializeSuggestion(s);
      setAdded((prev) => new Set(prev).add(k));
      setSuggestions((prev) => prev.filter((item) => keyFor(item) !== k));
      window.dispatchEvent(new Event('lk:projects-updated'));
      onProjectAdded?.();
    } catch (err) {
      console.error('Failed to add project from suggestion:', err);
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (s: ProjectSuggestion) => {
    const k = keyFor(s);
    setDismissed((prev) => new Set(prev).add(k));
    setSuggestions((prev) => prev.filter((item) => keyFor(item) !== k));
    if (!demoMode) {
      try {
        if (s.id) await projectsApi.rejectSuggestion(s.id);
        else await projectsApi.rejectSuggestionByName(s.name);
      } catch {
        /* non-blocking */
      }
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-black/40 to-black/40 overflow-hidden mb-6">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            Projects detected in your story
          </h3>
          {!loading && visible.length > 0 && (
            <span className="flex-shrink-0 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-mono">
              {visible.length}
            </span>
          )}
          {demoMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-200/90 border border-yellow-500/25">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void fetchSuggestions({ rescan: true })}
            disabled={loading || rescanning}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Re-scan my chats for new projects"
          >
            <RefreshCw className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 sm:px-4 pb-4">
          {(loading || rescanning) && visible.length === 0 ? (
            <p className="text-xs text-white/50 font-mono py-3">
              {rescanning ? 'Re-reading your story for new projects…' : 'Loading project suggestions…'}
            </p>
          ) : visible.length === 0 && previewExamples.length > 0 ? (
            <>
              <p className="text-xs text-white/45 py-2 leading-relaxed">
                Mention what you&apos;re building in chat — LoreBook spots initiatives like these:
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 opacity-80">
                {previewExamples.map((s) => (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-black/30 p-3.5 border-dashed">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${typeColor(s.project_type)}`}>
                        {(s.project_type ?? 'project').toUpperCase()}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40">Example</span>
                    </div>
                    <h4 className="text-sm font-semibold text-white/80">{s.name}</h4>
                    {s.description && <p className="text-xs text-white/45 mt-1 line-clamp-2">{s.description}</p>}
                  </div>
                ))}
              </div>
            </>
          ) : visible.length === 0 ? (
            <p className="text-xs text-white/45 py-3 leading-relaxed">
              No pending project suggestions. Mention what you&apos;re building in chat — LoreBook uses lexical intelligence to spot initiatives and suggest them here.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 max-h-[min(20rem,50dvh)] sm:max-h-[28rem] overflow-y-auto overscroll-contain pr-1 -mr-1">
              {visible.map((s) => {
                const k = keyFor(s);
                const quote = evidenceQuote(s);
                const isSimilar = s.match_status === 'similar';
                return (
                  <div
                    key={k}
                    className="relative rounded-lg border border-white/10 bg-black/40 p-3.5 sm:p-4 hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s)}
                      className="absolute top-2 right-2 h-8 w-8 sm:h-6 sm:w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10 touch-manipulation"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5 pr-9 sm:pr-7">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${typeColor(s.project_type)}`}>
                        {(s.project_type ?? 'project').toUpperCase()}
                      </span>
                      {s.status && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/10 capitalize">
                          {s.status}
                        </span>
                      )}
                      {isSimilar && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25 flex items-center gap-0.5 max-w-full">
                          <Link2 className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">similar to {s.matched_project_name}</span>
                        </span>
                      )}
                      {typeof s.confidence === 'number' && (
                        <span className="text-[10px] text-white/40 font-mono">
                          {Math.round(s.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white leading-snug mb-1 flex items-start gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-primary/80 shrink-0 mt-0.5" />
                      <span className="break-words">{s.name}</span>
                    </h4>
                    {s.description && (
                      <p className="text-xs text-white/60 leading-relaxed line-clamp-2 mb-2">{s.description}</p>
                    )}
                    {s.reasoning && (
                      <p className="text-[11px] text-white/45 mb-2 leading-relaxed">{s.reasoning}</p>
                    )}
                    {quote && (
                      <p className="text-[11px] text-white/35 italic line-clamp-2 mb-3">&ldquo;{quote}&rdquo;</p>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                      {isSimilar ? (
                        <span className="flex items-center gap-1 text-xs text-amber-200/80 px-2 py-1 sm:mr-auto">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="leading-snug">Already tracked — add anyway?</span>
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleAdd(s)}
                        disabled={adding === k}
                        className="flex items-center justify-center gap-1 text-xs font-medium px-3 py-2.5 sm:px-2.5 sm:py-1 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-50 w-full sm:w-auto min-h-[44px] sm:min-h-0 touch-manipulation"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" />
                        {adding === k ? 'Adding…' : 'Add to projects'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
