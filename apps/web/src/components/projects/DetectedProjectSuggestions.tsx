import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, Briefcase, CheckCircle2 } from 'lucide-react';
import { projectsApi, type ProjectSuggestion } from '../../api/projects';
import { suggestionDismissApi } from '../../api/suggestionDismiss';
import { useSuggestionRescan } from '../../hooks/useSuggestionRescan';
import { filterVisibleSuggestions } from '../../lib/suggestionBookFilter';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { isSimilarSuggestion } from '../../lib/suggestionMatchTypes';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { getMockProjectSuggestions } from '../../mocks/projectSuggestions';
import { useSuggestionPanelDismissal } from '../../hooks/useSuggestionPanelDismissal';
import { SuggestionPanelEmptyState } from '../suggestions/SuggestionPanelEmptyState';
import { useToast } from '../ui/toast';
import { cn } from '../../lib/cn';

const ADD_TOAST_MS = 4500;
const CARD_EXIT_MS = 340;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Props {
  onProjectAdded?: () => void;
  demoMode?: boolean;
  existingProjectNames?: string[];
  existingBookEntries?: Array<{ id?: string; name: string }>;
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
  existingBookEntries = [],
}: Props) => {
  const { success, error, ToastContainer } = useToast();
  const [suggestions, setSuggestions] = useState<ProjectSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const { rescan: rescanChats, rescanning } = useSuggestionRescan('projects', {
    notify: { success, error },
    showToast: false,
  });
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (opts?: { silent?: boolean }) => {
    if (demoMode) {
      setSuggestions(getMockProjectSuggestions());
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      setSuggestions(await projectsApi.getSuggestions());
    } catch {
      if (!opts?.silent) setSuggestions([]);
    } finally {
      setLoading(false);
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

  const bookEntries = useMemo(() => {
    if (existingBookEntries.length > 0) return existingBookEntries;
    return existingProjectNames.map((name) => ({ name }));
  }, [existingBookEntries, existingProjectNames]);

  const visible = useMemo(() => {
    const stripSuffix = (name: string) =>
      name
        .toLowerCase()
        .replace(/^(?:the|my|our|a|an)\s+/, '')
        .replace(/\s+(?:project|app|website|build|feature|system|repo|initiative|product)$/i, '')
        .trim();

    const seenCanonical = new Set<string>();
    return filterVisibleSuggestions(
      suggestions
        .filter((s) => s.name?.trim())
        .filter((s) => !/^(and|or|but|project|app|feature|system|idea|thing|stuff)$/i.test(s.name.trim()))
        .filter((s) => s.match_status !== 'existing')
        .filter((s) => !dismissed.has(keyFor(s)) && !added.has(keyFor(s))),
      (s) => s.name,
      bookEntries
    )
      .filter((s) => {
        const canonical = stripSuffix(s.name.trim());
        if (seenCanonical.has(canonical)) return false;
        seenCanonical.add(canonical);
        return true;
      })
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 12);
  }, [suggestions, dismissed, added, bookEntries]);

  const previewExamples = useMemo(() => {
    if (demoMode || loading || rescanning || visible.length > 0) return [];
    return getMockProjectSuggestions();
  }, [demoMode, loading, rescanning, visible.length]);

  const { hidePanel, dismissEmptyPanel, reopenPanel } = useSuggestionPanelDismissal(
    'projects',
    visible.length,
    { loading, scanning: rescanning },
  );

  const handleRescan = useCallback(async () => {
    if (demoMode) return;
    reopenPanel();
    await rescanChats();
    await fetchSuggestions({ silent: true });
  }, [demoMode, rescanChats, fetchSuggestions, reopenPanel]);

  const handleAdd = async (s: ProjectSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    try {
      if (demoMode) {
        setExiting((prev) => new Set(prev).add(k));
        success(`"${s.name}" added to your Projects book.`, ADD_TOAST_MS, 'project');
        await delay(CARD_EXIT_MS);
        setAdded((prev) => new Set(prev).add(k));
        setExiting((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        onProjectAdded?.();
        return;
      }
      await projectsApi.materializeSuggestion(s);
      setExiting((prev) => new Set(prev).add(k));
      success(`"${s.name}" added to your Projects book.`, ADD_TOAST_MS, 'project');
      await delay(CARD_EXIT_MS);
      setAdded((prev) => new Set(prev).add(k));
      setSuggestions((prev) => prev.filter((item) => keyFor(item) !== k));
      setExiting((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
      window.dispatchEvent(new Event('lk:projects-updated'));
      onProjectAdded?.();
    } catch (err) {
      console.error('Failed to add project from suggestion:', err);
      error('Could not add project. Please try again.');
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
        await suggestionDismissApi.dismiss({
          bookDomain: 'projects',
          name: s.name,
          suggestionId: s.id,
          sourceMessageId: s.source_message_id,
        });
      } catch {
        /* non-blocking */
      }
    }
  };

  if (hidePanel) {
    return <ToastContainer />;
  }

  return (
    <>
    <ToastContainer />
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
            onClick={() => void handleRescan()}
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
            <div className="space-y-3">
              <p className="text-xs text-white/45 py-1 leading-relaxed">
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
              <SuggestionPanelEmptyState
                message="Nothing to confirm right now. Close this panel until LoreBook detects a new project in your story."
                onDismiss={dismissEmptyPanel}
                onRescan={demoMode ? undefined : () => void handleRescan()}
                rescanning={rescanning}
                rescanLabel="Rescan for projects"
              />
            </div>
          ) : visible.length === 0 ? (
            <SuggestionPanelEmptyState
              message="No pending project suggestions. Mention what you're building in chat — LoreBook uses lexical intelligence to spot initiatives and suggest them here."
              onDismiss={dismissEmptyPanel}
              onRescan={demoMode ? undefined : () => void handleRescan()}
              rescanning={rescanning}
              rescanLabel="Rescan for projects"
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 max-h-[min(20rem,50dvh)] sm:max-h-[28rem] overflow-y-auto overscroll-contain pr-1 -mr-1">
              {visible.map((s) => {
                const k = keyFor(s);
                const quote = evidenceQuote(s);
                const isSimilar = isSimilarSuggestion(s) || s.match_status === 'similar';
                return (
                  <div
                    key={k}
                    className={cn(
                      'relative rounded-lg border border-white/10 bg-black/40 p-3.5 sm:p-4 hover:border-primary/40 transition-colors',
                      exiting.has(k) && 'animate-romantic-exit pointer-events-none'
                    )}
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
                        <SuggestionMergeHint
                          item={s}
                          bookLabel="Projects book"
                        />
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

                    <SuggestionCategoryRedirect
                      name={s.name}
                      fromDomain="projects"
                      suggestionId={s.id}
                      alternatives={s.alternative_categories}
                      description={s.description}
                      evidence={quote}
                      disabled={adding === k}
                      onReclassified={() => void handleDismiss(s)}
                      className="mb-2"
                    />

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
                        {adding === k ? 'Adding…' : suggestionPrimaryActionLabel({ item: s, addLabel: 'Add to projects' })}
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
    </>
  );
};
