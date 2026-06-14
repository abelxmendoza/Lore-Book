import { Sparkles, type LucideIcon } from 'lucide-react';

/**
 * Shared "not enough information yet" state for character-card sections.
 *
 * Lorebook's honesty principle (see {@link ./UnknownField}): a sparse section is
 * a known gap, not a bug. Real users with thin profiles should get the same
 * intentional treatment everywhere — Intelligence, What I Know, Perceptions —
 * instead of ad-hoc one-off empty states that read like errors.
 *
 * The dashed border + accent tint echoes the UnknownField "no data" tier. When
 * `action` is provided the section is chat-first, matching how unknowns are
 * filled in across the product.
 */
type Accent = 'neutral' | 'yellow' | 'indigo' | 'violet' | 'purple';

const ACCENTS: Record<Accent, { border: string; bg: string; icon: string; btn: string }> = {
  neutral: {
    border: 'border-white/12',
    bg: 'bg-white/[0.03]',
    icon: 'text-white/25',
    btn: 'text-primary/80 border-white/15 hover:text-primary hover:border-white/30',
  },
  yellow: {
    border: 'border-yellow-500/20',
    bg: 'bg-yellow-950/10',
    icon: 'text-yellow-400/40',
    btn: 'text-yellow-300 border-yellow-500/30 hover:text-yellow-200 hover:border-yellow-500/50',
  },
  indigo: {
    border: 'border-indigo-500/20',
    bg: 'bg-indigo-950/10',
    icon: 'text-indigo-400/40',
    btn: 'text-indigo-300 border-indigo-500/30 hover:text-indigo-200 hover:border-indigo-500/50',
  },
  violet: {
    border: 'border-violet-500/20',
    bg: 'bg-violet-950/10',
    icon: 'text-violet-400/40',
    btn: 'text-violet-300 border-violet-500/30 hover:text-violet-200 hover:border-violet-500/50',
  },
  purple: {
    border: 'border-purple-500/20',
    bg: 'bg-purple-950/10',
    icon: 'text-purple-400/40',
    btn: 'text-purple-300 border-purple-500/30 hover:text-purple-200 hover:border-purple-500/50',
  },
};

interface InsufficientDataProps {
  /** Headline, e.g. "Still learning about Sarah" */
  title: string;
  /** One-line explanation of why this is sparse and what fills it in. */
  description: string;
  /** Icon for the section (defaults to Sparkles). */
  icon?: LucideIcon;
  /** Accent tint — match the section's color. */
  accent?: Accent;
  /** Optional chat-first CTA. */
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  /** Tighter padding for sub-sections nested inside a tab. */
  compact?: boolean;
}

export const InsufficientData = ({
  title,
  description,
  icon: Icon = Sparkles,
  accent = 'neutral',
  action,
  compact,
}: InsufficientDataProps) => {
  const a = ACCENTS[accent];
  const ActionIcon = action?.icon;

  return (
    <div
      data-testid="insufficient-data"
      className={`rounded-xl border border-dashed ${a.border} ${a.bg} text-center ${compact ? 'px-4 py-7' : 'px-4 py-12'}`}
    >
      <Icon className={`mx-auto mb-3 ${a.icon} ${compact ? 'h-7 w-7' : 'h-9 w-9'}`} />
      <p className="text-sm font-medium text-white/70 mb-1">{title}</p>
      <p className="mx-auto max-w-xs text-xs leading-relaxed text-white/40">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-4 inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs transition-colors ${a.btn}`}
        >
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  );
};
