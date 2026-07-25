import { HelpCircle } from 'lucide-react';

/**
 * Explicit "unknown" state for a field the record doesn't cover yet.
 *
 * Lorebook's honesty principle: missing knowledge is shown, not silently
 * omitted. Gray dashed styling extends the existing confidence color bands
 * (green/yellow/orange/red) with a "no data" tier.
 *
 * Prefer `onActivate` when the click should jump to an in-modal editor.
 * Use `onAskInChat` when filling the gap is chat-first.
 */
interface UnknownFieldProps {
  /** Field name shown in the chip, e.g. "Role", "Pronouns", "When" */
  label: string;
  /** Prefill text for the chat composer, e.g. "Sarah's role in my life is " */
  prompt?: string;
  /** Jump to chat with the prompt; omit to render a non-interactive chip */
  onAskInChat?: (prompt: string) => void;
  /** Navigate to an in-app editor for this field (takes precedence over chat). */
  onActivate?: () => void;
  /** Override the interactive hint after the label (default depends on handler). */
  actionHint?: string;
  /** Small badge variant for profile cards */
  compact?: boolean;
}

export const UnknownField = ({
  label,
  prompt,
  onAskInChat,
  onActivate,
  actionHint,
  compact,
}: UnknownFieldProps) => {
  const interactive = Boolean(onActivate || onAskInChat);
  const hint =
    actionHint ??
    (onActivate ? 'click to set' : onAskInChat ? 'tell Lorebook in chat' : undefined);
  const baseClasses =
    'inline-flex items-center gap-1.5 rounded-md bg-gray-500/10 text-gray-400 border border-dashed border-gray-500/30';
  const sizeClasses = compact ? 'px-1.5 py-0 text-[9px]' : 'px-2.5 py-1 text-xs';
  const hoverClasses = interactive
    ? ' hover:bg-gray-500/20 hover:text-gray-300 hover:border-gray-400/40 transition-colors cursor-pointer'
    : '';

  const content = (
    <>
      <HelpCircle className={compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} />
      {compact ? (
        <span>Unknown</span>
      ) : (
        <span>
          {label}: unknown{hint ? ` — ${hint}` : ''}
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <span data-testid="unknown-field" className={`${baseClasses} ${sizeClasses}`} title={`${label} is not in your record yet`}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="unknown-field"
      onClick={(e) => {
        e.stopPropagation();
        if (onActivate) {
          onActivate();
          return;
        }
        onAskInChat?.(prompt ?? `Let me tell you about ${label.toLowerCase()}: `);
      }}
      className={`${baseClasses} ${sizeClasses}${hoverClasses}`}
      title={`${label} is not in your record yet${hint ? ` — ${hint}` : ''}`}
    >
      {content}
    </button>
  );
};
