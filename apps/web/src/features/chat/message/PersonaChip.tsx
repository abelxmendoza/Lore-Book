import { useState } from 'react';
import { Heart, Target, BookOpen, Sparkles, MessageCircle, Archive } from 'lucide-react';

interface PersonaCfg {
  label: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const PERSONA_CONFIG: Record<string, PersonaCfg> = {
  therapist: {
    label:   'Therapist',
    tooltip: 'Processing what\'s happening right now — validating, listening, asking one gentle question at a time.',
    icon:    Heart,
    color:   'text-rose-400/80 bg-rose-500/8 border-rose-500/20',
  },
  strategist: {
    label:   'Strategist',
    tooltip: 'Turning your patterns into a plan — actionable next steps based on your actual history.',
    icon:    Target,
    color:   'text-amber-400/80 bg-amber-500/8 border-amber-500/20',
  },
  gossip_buddy: {
    label:   'Gossip Buddy',
    tooltip: 'Digging into the people and relationships in your story — curious, engaged, enthusiastic.',
    icon:    MessageCircle,
    color:   'text-purple-400/80 bg-purple-500/8 border-purple-500/20',
  },
  archivist: {
    label:   'Archivist',
    tooltip: 'Retrieving facts from your entries — dates, quotes, what you actually wrote. No spin.',
    icon:    Archive,
    color:   'text-blue-400/80 bg-blue-500/8 border-blue-500/20',
  },
  soul_capturer: {
    label:   'Soul Capturer',
    tooltip: 'Tracking who you consistently are across time — the values, fears, and patterns that keep showing up.',
    icon:    Sparkles,
    color:   'text-violet-400/80 bg-violet-500/8 border-violet-500/20',
  },
  biography_writer: {
    label:   'Biography Writer',
    tooltip: 'Helping you see structure in the story you\'ve lived — chapters, turning points, arcs.',
    icon:    BookOpen,
    color:   'text-teal-400/80 bg-teal-500/8 border-teal-500/20',
  },
};

interface PersonaChipProps {
  persona: string;
}

export const PersonaChip = ({ persona }: PersonaChipProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const cfg = PERSONA_CONFIG[persona.toLowerCase()];
  if (!cfg) return null;

  const Icon = cfg.icon;

  return (
    <div className="relative inline-block mt-2">
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs cursor-default ${cfg.color}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={`${cfg.label}: ${cfg.tooltip}`}
      >
        <Icon className="h-3 w-3" />
        <span>{cfg.label}</span>
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-1.5 z-50 w-56 rounded-lg border border-white/10 bg-black/90 backdrop-blur-sm px-3 py-2 text-xs text-white/70 leading-relaxed shadow-xl pointer-events-none"
        >
          <p className="font-medium text-white/90 mb-0.5">{cfg.label}</p>
          <p>{cfg.tooltip}</p>
          {/* Arrow */}
          <div className="absolute top-full left-3 border-4 border-transparent border-t-black/90" />
        </div>
      )}
    </div>
  );
};
