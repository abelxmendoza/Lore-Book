import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, Layers, GitBranch, Mic } from 'lucide-react';
import { Badge } from '../ui/badge';

interface SelfTheme {
  theme: string;
  strength: number;
  evidence: string[];
}

interface TurningPoint {
  id: string;
  timestamp: string;
  description: string;
  category: string;
  emotionalImpact: number;
}

interface StoryArcSegment {
  title: string;
  era: string;
  content: string;
  themes: string[];
}

interface StoryCoherence {
  coherenceScore: number;
  contradictions: string[];
  missingPieces: string[];
}

interface NarrativeMode {
  mode: string;
  confidence: number;
}

export interface StoryOfSelf {
  id: string;
  themes: SelfTheme[];
  turningPoints: TurningPoint[];
  mode: NarrativeMode;
  arcs: StoryArcSegment[];
  coherence: StoryCoherence;
  voicePrint: string;
  summary: string;
}

interface NarrativeStoryPanelProps {
  story: StoryOfSelf;
  entryCount?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  trauma: 'text-red-400 border-red-400/40 bg-red-400/10',
  victory: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  loss: 'text-slate-400 border-slate-400/40 bg-slate-400/10',
  awakening: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  shift: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
  fall: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
  rise: 'text-violet-400 border-violet-400/40 bg-violet-400/10',
  betrayal: 'text-rose-400 border-rose-400/40 bg-rose-400/10',
  breakthrough: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10',
};

const THEME_BAR_COLOR = 'bg-primary/60';

function Section({
  icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white/80"
      >
        <div className="flex items-center gap-2">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-white/40" /> : <ChevronDown className="h-3.5 w-3.5 text-white/40" />}
      </button>
      {open && <div className="px-4 py-3 space-y-2">{children}</div>}
    </div>
  );
}

export function NarrativeStoryPanel({ story, entryCount }: NarrativeStoryPanelProps) {
  const topThemes = [...story.themes].sort((a, b) => b.strength - a.strength).slice(0, 6);

  return (
    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Your Narrative</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-primary/40 text-primary/80 bg-primary/5">
            {story.mode.mode}
          </Badge>
          {entryCount != null && (
            <span className="text-xs text-white/30">{entryCount} entries</span>
          )}
        </div>
      </div>

      {/* Themes */}
      {topThemes.length > 0 && (
        <Section icon={<Layers className="h-3.5 w-3.5 text-primary/70" />} title="Core Themes" defaultOpen>
          <div className="space-y-2">
            {topThemes.map((t) => (
              <div key={t.theme}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="capitalize text-white/70">{t.theme.replace(/_/g, ' ')}</span>
                  <span className="text-white/40">{Math.round(t.strength * 100)}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${THEME_BAR_COLOR} rounded-full transition-all`}
                    style={{ width: `${Math.round(t.strength * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Turning Points */}
      {story.turningPoints.length > 0 && (
        <Section icon={<Zap className="h-3.5 w-3.5 text-amber-400/80" />} title="Turning Points">
          <div className="space-y-2">
            {story.turningPoints.slice(0, 5).map((tp) => {
              const colorClass = CATEGORY_COLORS[tp.category] ?? 'text-white/60 border-white/20 bg-white/5';
              const month = tp.timestamp?.substring(0, 7) ?? '';
              return (
                <div key={tp.id} className="flex gap-3 items-start">
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 capitalize border ${colorClass}`}
                  >
                    {tp.category}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 leading-snug">{tp.description}</p>
                    {month && <p className="text-[10px] text-white/30 mt-0.5">{month}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Story Arcs */}
      {story.arcs.length > 0 && (
        <Section icon={<GitBranch className="h-3.5 w-3.5 text-violet-400/80" />} title="Story Arcs">
          <div className="space-y-3">
            {story.arcs.slice(0, 3).map((arc, idx) => (
              <div key={idx} className="border-l-2 border-violet-400/30 pl-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-white/80">{arc.title}</span>
                  {arc.era && <span className="text-[10px] text-white/30">{arc.era}</span>}
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{arc.content}</p>
                {arc.themes.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {arc.themes.map((t, i) => (
                      <span key={i} className="text-[10px] text-primary/60 capitalize">
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Voice Print */}
      {story.voicePrint && (
        <div className="flex items-start gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
          <Mic className="h-3.5 w-3.5 text-white/30 mt-0.5 shrink-0" />
          <p className="text-xs text-white/50 italic leading-relaxed">{story.voicePrint}</p>
        </div>
      )}

      {/* Coherence footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-white/25">narrative coherence</span>
        <span className="text-[10px] text-white/40">{Math.round(story.coherence.coherenceScore * 100)}%</span>
      </div>
    </div>
  );
}
