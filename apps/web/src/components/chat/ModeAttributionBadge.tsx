import { useState } from 'react';
import { BookOpen, Brain, Heart, MessageSquare, ListChecks, HelpCircle, Layers } from 'lucide-react';
import { formatEpistemicPercent } from '../../lib/epistemicLabels';

type ModeDecision = {
  mode: string;
  confidence: number;
  reasoning: string;
};

// Human-readable labels — emotionally resonant, not technical
const MODE_LABELS: Record<string, string> = {
  EXPERIENCE_INGESTION:  'writing this to memory',
  MEMORY_RECALL:         'remembering',
  NARRATIVE_RECALL:      'searching your story',
  NARRATIVE_STORY:       'unfolding your narrative',
  EMOTIONAL_EXISTENTIAL: 'holding space',
  ACTION_LOG:            'noting this',
  NEEDS_CLARIFICATION:   'clarifying',
  MIXED:                 'processing',
  REFLECTION:            'reflecting',
  QUESTION_ANSWER:       'answering',
};

const MODE_ICONS: Record<string, React.ElementType> = {
  EXPERIENCE_INGESTION:  Brain,
  MEMORY_RECALL:         BookOpen,
  NARRATIVE_RECALL:      BookOpen,
  NARRATIVE_STORY:       Layers,
  EMOTIONAL_EXISTENTIAL: Heart,
  ACTION_LOG:            ListChecks,
  NEEDS_CLARIFICATION:   HelpCircle,
  MIXED:                 Layers,
  REFLECTION:            Brain,
  QUESTION_ANSWER:       MessageSquare,
};

const MODE_COLOR: Record<string, string> = {
  EXPERIENCE_INGESTION:  'text-blue-400/70',
  MEMORY_RECALL:         'text-purple-400/70',
  NARRATIVE_RECALL:      'text-purple-400/70',
  NARRATIVE_STORY:       'text-indigo-400/70',
  EMOTIONAL_EXISTENTIAL: 'text-pink-400/70',
  ACTION_LOG:            'text-orange-400/70',
  NEEDS_CLARIFICATION:   'text-yellow-400/70',
  MIXED:                 'text-white/40',
  REFLECTION:            'text-teal-400/70',
  QUESTION_ANSWER:       'text-green-400/70',
};

interface Props {
  modeDecision: ModeDecision;
}

export const ModeAttributionBadge = ({ modeDecision }: Props) => {
  const [hovered, setHovered] = useState(false);

  const { mode, confidence, reasoning } = modeDecision;

  // Don't render for unknown/low-confidence modes
  if (!mode || mode === 'UNKNOWN' || confidence < 0.45) return null;

  const label = MODE_LABELS[mode];
  if (!label) return null;

  const Icon = MODE_ICONS[mode] ?? Brain;
  const color = MODE_COLOR[mode] ?? 'text-white/30';

  // Confidence expressed as opacity, not a number — keeps it non-technical
  const dotOpacity = confidence >= 0.85 ? 'opacity-100' : confidence >= 0.65 ? 'opacity-60' : 'opacity-30';

  return (
    <div className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`flex items-center gap-1.5 text-xs transition-opacity cursor-default select-none ${color}`}
        aria-label={`Mode: ${label}${reasoning ? ` — ${reasoning}` : ''}`}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${dotOpacity}`} />
        <Icon className="h-3 w-3" />
        <span className="font-normal italic">{label}</span>
      </button>

      {hovered && reasoning && (
        <div className="absolute bottom-full left-0 mb-2 z-20 w-64 rounded-lg bg-black/80 border border-white/10 px-3 py-2 shadow-xl pointer-events-none">
          <p className="text-xs text-white/60 leading-relaxed">{reasoning}</p>
          <p className="text-xs text-white/25 mt-1 font-mono">
            {formatEpistemicPercent(confidence)}
          </p>
        </div>
      )}
    </div>
  );
};
