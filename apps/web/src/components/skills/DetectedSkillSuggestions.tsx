// =====================================================
// DETECTED SKILL SUGGESTIONS
// A non-blocking, dismissible surface for skills LoreBook detected in your chats
// and journal that you don't track yet. Each can be added to the Skills book in
// one tap. Mirrors DetectedQuestSuggestions / GroupSuggestions so detection →
// review → add feels consistent across the app.
// =====================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { skillsApi, type SkillSuggestion } from '../../api/skills';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

interface Props {
  /** Called after a skill is added so the book can refresh. */
  onSkillAdded?: () => void;
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

const keyFor = (s: SkillSuggestion) => s.skill_name.toLowerCase();

export const DetectedSkillSuggestions = ({ onSkillAdded }: Props) => {
  const isMock = useShouldUseMockData();
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (isMock) { setSuggestions([]); setLoading(false); return; }
    setLoading(true);
    try {
      setSuggestions(await skillsApi.getSuggestions());
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    void fetchSuggestions();
    // Periodically re-read so newly-developed skills surface on their own.
    const interval = setInterval(() => { void fetchSuggestions(); }, 5 * 60 * 1000);
    const onRefresh = () => { void fetchSuggestions(); };
    window.addEventListener('lk:skills-updated', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('lk:skills-updated', onRefresh);
    };
  }, [fetchSuggestions]);

  const visible = useMemo(() => {
    return suggestions
      .filter(s => s.skill_name?.trim())
      .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 12);
  }, [suggestions, dismissed, added]);

  if (!loading && visible.length === 0) return null;

  const handleAdd = async (s: SkillSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    try {
      await skillsApi.createSkill({
        skill_name: s.skill_name,
        skill_category: s.skill_category,
        description: s.description,
        auto_detected: true,
        confidence_score: s.confidence,
      });
      setAdded(prev => new Set(prev).add(k));
      onSkillAdded?.();
      window.dispatchEvent(new Event('lk:skills-updated'));
    } catch (err) {
      console.error('Failed to add skill from suggestion:', err);
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = (s: SkillSuggestion) => {
    setDismissed(prev => new Set(prev).add(keyFor(s)));
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-black/40 to-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            Detected from your story
          </h3>
          {!loading && (
            <span className="flex-shrink-0 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-mono">
              {visible.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Re-scan my chats for new skills"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 sm:px-4 pb-4">
          {loading && visible.length === 0 ? (
            <p className="text-xs text-white/50 font-mono py-3">Reading your story for new skills…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 max-h-[22rem] sm:max-h-[28rem] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
              {visible.map(s => {
                const k = keyFor(s);
                return (
                  <div
                    key={k}
                    className="relative rounded-lg border border-white/10 bg-black/40 p-3.5 sm:p-4 hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => handleDismiss(s)}
                      className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5 mb-1.5 pr-7 flex-wrap">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catColor(s.skill_category)}`}>
                        {String(s.skill_category ?? 'skill').toUpperCase()}
                      </span>
                      {typeof s.confidence === 'number' && (
                        <span className="text-[10px] text-white/40 font-mono">
                          {Math.round(s.confidence * 100)}% match
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white leading-snug mb-1">{s.skill_name}</h4>
                    {s.description && (
                      <p className="text-xs text-white/60 leading-relaxed line-clamp-3 mb-2">{s.description}</p>
                    )}
                    {s.evidence && s.evidence.length > 0 && (
                      <p className="text-[11px] text-white/40 italic leading-relaxed line-clamp-2 mb-3">
                        “{s.evidence[0]}”
                      </p>
                    )}

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => void handleAdd(s)}
                        disabled={adding === k}
                        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
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
