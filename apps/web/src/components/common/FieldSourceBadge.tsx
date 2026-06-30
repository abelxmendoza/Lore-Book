import { Sparkles, Check, HelpCircle } from 'lucide-react';

/**
 * Where a field's value came from:
 *  - `auto`      — detected automatically from chat (not yet user-touched)
 *  - `confirmed` — the user explicitly set/confirmed it (locked from auto-overwrite)
 *  - `unknown`   — no value yet
 */
export type FieldSource = 'auto' | 'confirmed' | 'unknown';

/** Normalize a stored metadata `_source` string into a FieldSource. */
export function toFieldSource(raw: unknown, hasValue: boolean): FieldSource {
  if (raw === 'user_confirmed' || raw === 'confirmed') return 'confirmed';
  if (!hasValue) return 'unknown';
  return 'auto';
}

const CONFIG: Record<FieldSource, { label: string; title: string; className: string; Icon: typeof Sparkles }> = {
  auto: {
    label: 'Auto',
    title: 'Auto-detected from your chats. Edit to confirm or correct it.',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    Icon: Sparkles,
  },
  confirmed: {
    label: 'Confirmed',
    title: "You confirmed this. Auto-detection won't overwrite it.",
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    Icon: Check,
  },
  unknown: {
    label: 'Unknown',
    title: 'Not known yet — add it, or ask in chat.',
    className: 'border-white/15 bg-white/5 text-white/45',
    Icon: HelpCircle,
  },
};

/** Tiny provenance pill shown next to an editable field. */
export function FieldSourceBadge({
  source,
  className = '',
  showLabel = true,
}: {
  source: FieldSource;
  className?: string;
  showLabel?: boolean;
}) {
  const { label, title, className: tone, Icon } = CONFIG[source];
  return (
    <span
      title={title}
      data-testid={`field-source-${source}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${tone} ${className}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
