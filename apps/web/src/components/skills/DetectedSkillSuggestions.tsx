// =====================================================
// DETECTED SKILL SUGGESTIONS
// Skills LoreBook detected in chats/journal — confirm before they become truth.
// =====================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, Briefcase, Heart, GitBranch } from 'lucide-react';
import { skillsApi, type SkillSuggestion } from '../../api/skills';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { monetizationLabel, usageLabel } from '../../lib/skillProfile';
import { getMockSkillSuggestions } from '../../mocks/skillSuggestions';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import { triggerCelebration } from '../../lib/celebrations';

interface Props {
  onSkillAdded?: () => void;
  demoMode?: boolean;
  existingSkillNames?: string[];
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
}: Props) => {
  const shouldUseMock = useShouldUseMockData();
  const showDemo = demoMode || shouldUseMock;
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (opts?: { rescan?: boolean; silent?: boolean }) => {
    if (showDemo) {
      const existing = mockDataService.get.skillSuggestions();
      const list = existing.length > 0 ? existing : getMockSkillSuggestions();
      mockDataService.register.skillSuggestions(list);
      setSuggestions(list);
      setLoading(false);
      return;
    }
    if (opts?.rescan) setRescanning(true);
    else if (!opts?.silent) setLoading(true);
    try {
      setSuggestions(await skillsApi.getSuggestions({ rescan: opts?.rescan }));
    } catch {
      if (!opts?.silent) setSuggestions([]);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  }, [showDemo]);

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

  const existingSet = useMemo(
    () => new Set(existingSkillNames.map(n => n.toLowerCase())),
    [existingSkillNames]
  );

  const visible = useMemo(
    () =>
      suggestions
        .filter(s => s.skill_name?.trim())
        .filter(s => !existingSet.has(s.skill_name.trim().toLowerCase()))
        .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 12),
    [suggestions, dismissed, added, existingSet]
  );

  const handleAdd = async (s: SkillSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    try {
      if (showDemo) {
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
      setAdded(prev => new Set(prev).add(k));
      setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
      onSkillAdded?.();
    } catch (err) {
      console.error('Failed to add skill from suggestion:', err);
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
      if (s.id) await skillsApi.rejectSuggestion(s.id);
      else await skillsApi.rejectSuggestionByName(s.skill_name);
    } catch {
      /* non-blocking */
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-black/40 to-black/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            Skills detected in your story
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
            title="Re-scan my chats for new skills"
          >
            <RefreshCw className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} />
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
        <div className="px-3 sm:px-4 pb-4">
          {(loading || rescanning) && visible.length === 0 ? (
            <p className="text-xs text-white/50 font-mono py-3">
              {rescanning ? 'Re-reading your story for new skills…' : 'Loading skill suggestions…'}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-white/45 py-3 leading-relaxed">
              No pending skill suggestions. Use the refresh button to scan your chats again, or keep talking about what you practice and build.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 max-h-[min(28rem,50vh)] overflow-y-auto pr-0.5">
              {visible.map(s => {
                const k = keyFor(s);
                const quote = evidenceQuote(s);
                return (
                  <div
                    key={k}
                    className="relative rounded-lg border border-white/10 bg-black/40 p-3.5 sm:p-4 hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s)}
                      className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5 pr-7">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catColor(s.skill_category)}`}>
                        {(s.skill_type ?? s.skill_category ?? 'skill').toUpperCase()}
                      </span>
                      {s.parent_skill_name && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 border border-violet-500/25 flex items-center gap-0.5">
                          <GitBranch className="h-2.5 w-2.5" />
                          under {s.parent_skill_name}
                        </span>
                      )}
                      {s.monetization && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/25 flex items-center gap-0.5">
                          <Briefcase className="h-2.5 w-2.5" />
                          {monetizationLabel(s.monetization)}
                        </span>
                      )}
                      {typeof s.confidence === 'number' && (
                        <span className="text-[10px] text-white/40 font-mono">
                          {Math.round(s.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white leading-snug mb-1">{s.skill_name}</h4>
                    {s.description && (
                      <p className="text-xs text-white/60 leading-relaxed line-clamp-2 mb-2">{s.description}</p>
                    )}
                    {s.origin_story && (
                      <p className="text-[11px] text-white/45 line-clamp-2 mb-2">{s.origin_story}</p>
                    )}
                    {quote && (
                      <p className="text-[11px] text-white/35 italic line-clamp-2 mb-2">&ldquo;{quote}&rdquo;</p>
                    )}

                    <div className="flex flex-wrap gap-2 text-[10px] text-white/40 mb-3">
                      {typeof s.proficiency === 'number' && <span>Proficiency {s.proficiency}%</span>}
                      {typeof s.enjoyment === 'number' && (
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-2.5 w-2.5" /> {s.enjoyment}% enjoyment
                        </span>
                      )}
                      {s.usage_frequency && <span>{usageLabel(s.usage_frequency)}</span>}
                      {s.trajectory && s.trajectory !== 'unknown' && (
                        <span className="capitalize">{s.trajectory}</span>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleAdd(s)}
                        disabled={adding === k}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {adding === k ? 'Adding…' : 'Add to skills'}
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
