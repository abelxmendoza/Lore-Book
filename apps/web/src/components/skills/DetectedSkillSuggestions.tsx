// =====================================================
// DETECTED SKILL SUGGESTIONS
// Skills LoreBook detected in chats/journal — confirm before they become truth.
// =====================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, Briefcase, Heart, GitBranch } from 'lucide-react';
import { skillsApi, type SkillSuggestion } from '../../api/skills';
import { suggestionDismissApi } from '../../api/suggestionDismiss';
import { useSuggestionRescan } from '../../hooks/useSuggestionRescan';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { filterVisibleSuggestions } from '../../lib/suggestionBookFilter';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { isSimilarSuggestion, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import { monetizationLabel, usageLabel } from '../../lib/skillProfile';
import { getAvailableMockSkillSuggestions } from '../../mocks/skillSuggestions';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import { triggerCelebration } from '../../lib/celebrations';
import { useSuggestionPanelDismissal } from '../../hooks/useSuggestionPanelDismissal';
import { SuggestionPanelEmptyState } from '../suggestions/SuggestionPanelEmptyState';
import { formatSkillCertaintyDetail } from '../../lib/skillStory';

interface Props {
  onSkillAdded?: () => void;
  demoMode?: boolean;
  existingSkillNames?: string[];
  existingBookEntries?: Array<{ id?: string; name: string }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  professional: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  creative: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  artistic: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
  technical: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  physical: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  social: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  intellectual: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  emotional: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  practical: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};
const catColor = (c?: string) => CATEGORY_COLORS[c ?? ''] ?? 'bg-white/10 text-white/60 border-white/20';

const keyFor = (s: SkillSuggestion) => s.id;

function evidenceQuote(s: SkillSuggestion): string | undefined {
  const raw = s.evidence?.[0];
  if (!raw) return undefined;
  return typeof raw === 'string' ? raw : raw.text;
}

export const DetectedSkillSuggestions = ({
  onSkillAdded,
  demoMode = false,
  existingSkillNames = [],
  existingBookEntries = [],
}: Props) => {
  const shouldUseMock = useShouldUseMockData();
  const showDemo = demoMode || shouldUseMock;
  const { rescan: rescanChats, rescanning, RescanToastContainer } = useSuggestionRescan('skills');
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [demoRescanning, setDemoRescanning] = useState(false);
  const [rescanNotice, setRescanNotice] = useState<string | null>(null);

  const scanning = rescanning || demoRescanning;

  const inBookSkillNames = useCallback((): string[] => {
    const fromBook = existingSkillNames.map((n) => n.trim()).filter(Boolean);
    const fromMock = mockDataService.get.skills().map((s) => s.skill_name.trim()).filter(Boolean);
    return [...new Set([...fromBook, ...fromMock])];
  }, [existingSkillNames]);

  const fetchSuggestions = useCallback(async (opts?: { silent?: boolean }) => {
    if (showDemo) {
      const list = getAvailableMockSkillSuggestions(inBookSkillNames());
      mockDataService.register.skillSuggestions(list);
      setSuggestions(list);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      setSuggestions(await skillsApi.getSuggestions());
    } catch {
      if (!opts?.silent) setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [showDemo, inBookSkillNames]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (!showDemo) {
      return onStoryDataUpdated(() => {
        void fetchSuggestions({ silent: true });
      }, 'skills');
    }
    const refresh = () => { void fetchSuggestions({ silent: true }); };
    window.addEventListener('lk:skills-updated', refresh);
    return () => window.removeEventListener('lk:skills-updated', refresh);
  }, [fetchSuggestions, showDemo]);

  useEffect(() => {
    if (!rescanNotice) return;
    const timer = window.setTimeout(() => setRescanNotice(null), 5200);
    return () => window.clearTimeout(timer);
  }, [rescanNotice]);

  const bookEntries = useMemo(() => {
    if (existingBookEntries.length > 0) return existingBookEntries;
    return existingSkillNames.map((name) => ({ name }));
  }, [existingBookEntries, existingSkillNames]);

  const visible = useMemo(
    () =>
      filterVisibleSuggestions(
        suggestions
          .filter(s => s.skill_name?.trim())
          .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s))),
        (s) => s.skill_name,
        bookEntries
      )
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 12),
    [suggestions, dismissed, added, bookEntries]
  );

  const { hidePanel, dismissEmptyPanel, reopenPanel } = useSuggestionPanelDismissal(
    'skills',
    visible.length,
    { loading, scanning },
  );

  const handleRescan = useCallback(async () => {
    reopenPanel();
    if (showDemo) {
      setDemoRescanning(true);
      setRescanNotice(null);
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const list = getAvailableMockSkillSuggestions(inBookSkillNames());
        mockDataService.register.skillSuggestions(list);
        setSuggestions(list);
        setDismissed(new Set());
        setAdded(new Set());
        setRescanNotice(
          list.length > 0
            ? `Demo rescan found ${list.length} skill${list.length === 1 ? '' : 's'} to add.`
            : 'Demo rescan complete — all sample skills are already in your book.',
        );
      } finally {
        setDemoRescanning(false);
      }
      return;
    }
    await rescanChats();
    await fetchSuggestions({ silent: true });
    window.dispatchEvent(new CustomEvent('lk:skills-updated', { detail: {} }));
  }, [showDemo, inBookSkillNames, rescanChats, fetchSuggestions, reopenPanel]);

  const handleAdd = async (s: SkillSuggestion) => {
    const k = keyFor(s);
    if (isSimilarSuggestion(s)) {
      setDismissed(prev => new Set(prev).add(k));
      return;
    }
    setAdding(k);
    try {
      if (showDemo) {
        await new Promise((resolve) => window.setTimeout(resolve, 680));
        mockDataService.mutate.skills.createFromSuggestion(s);
        mockDataService.mutate.skills.removeSuggestion({ id: s.id, skill_name: s.skill_name });
      } else {
        await skillsApi.materializeSuggestion(s);
        triggerCelebration({
          variant: 'skill',
          label: `${s.skill_name} added to Skills`,
          subtitle: s.skill_category ? `${s.skill_category} skill unlocked` : 'New skill unlocked',
          xp: 35,
        });
      }

      setExiting((prev) => new Set(prev).add(k));
      await new Promise((resolve) => window.setTimeout(resolve, 360));

      setAdded((prev) => new Set(prev).add(k));
      setSuggestions((prev) => prev.filter((item) => keyFor(item) !== k));
      onSkillAdded?.();
    } catch (err) {
      console.error('Failed to add skill from suggestion:', err);
      setExiting((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (s: SkillSuggestion) => {
    const k = keyFor(s);
    setDismissed(prev => new Set(prev).add(k));
    setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
    if (showDemo) {
      mockDataService.mutate.skills.removeSuggestion({ id: s.id, skill_name: s.skill_name });
      return;
    }
    try {
      await suggestionDismissApi.dismiss({
        bookDomain: 'skills',
        name: s.skill_name,
        suggestionId: s.id,
        sourceMessageId: s.source_message_id,
      });
    } catch {
      /* non-blocking */
    }
  };

  if (hidePanel) {
    return RescanToastContainer ? <RescanToastContainer /> : null;
  }

  return (
    <>
    <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-black/40 to-black/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
          <h3 className="text-xs sm:text-base font-semibold text-white leading-tight line-clamp-2 sm:truncate">
            Skills detected in your story
          </h3>
          {!loading && visible.length > 0 && (
            <span className="flex-shrink-0 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-mono">
              {visible.length}
            </span>
          )}
          {showDemo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-200/90 border border-yellow-500/25">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={loading || scanning}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors touch-manipulation"
            title={showDemo ? 'Re-scan demo story for skills' : 'Re-scan my chats for new skills'}
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-2.5 sm:px-4 pb-3 sm:pb-4">
          {showDemo && (
            <p className="text-[11px] text-primary/80 leading-relaxed rounded-md border border-primary/20 bg-primary/5 px-2.5 sm:px-3 py-2 mb-2 sm:mb-3">
              LoreBook scanned sample chats and found skills not in your demo book yet. Tap Add to preview how confirmation works.
            </p>
          )}
          {rescanNotice && (
            <p className="text-[11px] sm:text-xs text-cyan-100 rounded border border-cyan-500/25 bg-cyan-500/10 px-2.5 sm:px-3 py-2 mb-2 animate-romantic-enter">
              {rescanNotice}
            </p>
          )}
          {(loading || scanning) && visible.length === 0 ? (
            <p className="text-[11px] sm:text-xs text-white/50 font-mono py-2 sm:py-3">
              {scanning ? 'Re-reading your story for new skills…' : 'Loading skill suggestions…'}
            </p>
          ) : visible.length === 0 ? (
            <SuggestionPanelEmptyState
              message="No pending skill suggestions. Use refresh to scan your chats again, or keep talking about what you practice and build."
              onDismiss={dismissEmptyPanel}
              onRescan={() => void handleRescan()}
              rescanning={scanning}
              rescanLabel={showDemo ? 'Rescan demo story' : 'Rescan for skills'}
            />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 max-h-[min(24rem,52dvh)] sm:max-h-[min(28rem,50vh)] overflow-y-auto overscroll-contain pr-0.5 -mr-0.5">
              {visible.map(s => {
                const k = keyFor(s);
                const quote = evidenceQuote(s);
                const isExiting = exiting.has(k);
                const isAdding = adding === k;
                return (
                  <div
                    key={k}
                    className={`relative flex flex-col rounded-lg border border-white/10 bg-black/40 p-2 sm:p-3.5 lg:p-4 hover:border-primary/40 transition-all min-h-0 ${
                      isExiting ? 'animate-romantic-exit pointer-events-none' : ''
                    } ${isAdding ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-black/80' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s)}
                      className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    </button>

                    <div className="flex flex-wrap items-center gap-1 mb-1 sm:mb-1.5 pr-5 sm:pr-7">
                      <span className={`text-[8px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.5 rounded border truncate max-w-full ${catColor(s.skill_category)}`}>
                        {(s.skill_type ?? s.skill_category ?? 'skill').toUpperCase()}
                      </span>
                      {s.parent_skill_name && (
                        <span className="hidden sm:inline-flex text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 border border-violet-500/25 items-center gap-0.5 max-w-full truncate">
                          <GitBranch className="h-2.5 w-2.5 shrink-0" />
                          under {s.parent_skill_name}
                        </span>
                      )}
                      <SuggestionMergeHint
                        item={s}
                        bookLabel="Skills book"
                        className={isSimilarSuggestion(s) ? 'inline-flex max-w-full' : 'hidden sm:inline-flex'}
                      />
                      {s.monetization && (
                        <span className="hidden sm:inline-flex text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/25 items-center gap-0.5">
                          <Briefcase className="h-2.5 w-2.5 shrink-0" />
                          {monetizationLabel(s.monetization)}
                        </span>
                      )}
                      {typeof s.confidence === 'number' && (
                        <span className="text-[8px] sm:text-[10px] text-white/40" title={formatSkillCertaintyDetail(s.confidence)}>
                          {formatSkillCertaintyDetail(s.confidence)}
                        </span>
                      )}
                    </div>

                    <h4 className="text-[11px] sm:text-sm font-semibold text-white leading-snug line-clamp-2 mb-0.5 sm:mb-1 pr-1">
                      {s.skill_name}
                    </h4>
                    {s.description && (
                      <p className="text-[10px] sm:text-xs text-white/60 leading-snug line-clamp-2 mb-1 sm:mb-2">{s.description}</p>
                    )}
                    {s.origin_story && (
                      <p className="hidden sm:block text-[11px] text-white/45 line-clamp-2 mb-2">{s.origin_story}</p>
                    )}
                    {quote && (
                      <p className="hidden lg:block text-[11px] text-white/35 italic line-clamp-2 mb-2">&ldquo;{quote}&rdquo;</p>
                    )}

                    <SuggestionCategoryRedirect
                      name={s.skill_name}
                      fromDomain="skills"
                      suggestionId={s.id}
                      alternatives={s.alternative_categories}
                      description={s.description}
                      evidence={quote}
                      disabled={adding === k}
                      onReclassified={() => void handleDismiss(s)}
                      className="hidden sm:block mb-2"
                    />

                    <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[8px] sm:text-[10px] text-white/40 mb-2 sm:mb-3">
                      {typeof s.proficiency === 'number' && <span>Prof {s.proficiency}%</span>}
                      {typeof s.enjoyment === 'number' && (
                        <span className="hidden sm:inline-flex items-center gap-0.5">
                          <Heart className="h-2.5 w-2.5" /> {s.enjoyment}%
                        </span>
                      )}
                      {s.usage_frequency && <span className="hidden sm:inline">{usageLabel(s.usage_frequency)}</span>}
                      {s.trajectory && s.trajectory !== 'unknown' && (
                        <span className="hidden sm:inline capitalize">{s.trajectory}</span>
                      )}
                    </div>

                    <div className="mt-auto flex justify-stretch sm:justify-end pt-0.5">
                      {isSimilarSuggestion(s) ? (
                        <span className="text-[9px] sm:text-xs text-amber-200/80 px-1 sm:px-2 py-1 leading-tight">
                          Already tracked
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleAdd(s)}
                          disabled={isAdding}
                          className="flex w-full sm:w-auto items-center justify-center gap-1 text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-2 sm:py-1 min-h-[44px] sm:min-h-0 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-50 touch-manipulation"
                        >
                          <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                          <span className="truncate">{isAdding ? 'Adding…' : 'Add'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
    {RescanToastContainer ? <RescanToastContainer /> : null}
    </>
  );
};
