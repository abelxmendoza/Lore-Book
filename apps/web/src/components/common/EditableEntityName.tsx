import { useEffect, useState } from 'react';
import { Check, X, Pencil, Loader2 } from 'lucide-react';

type EditableEntityNameProps = {
  /** Current name to display. */
  name: string;
  /**
   * Persist a new name. Should throw on failure so the inline error shows and
   * editing stays open. Resolve to commit and close the editor.
   */
  onSave: (newName: string) => Promise<void> | void;
  /** Classes for the displayed name text (keep the modal's existing title styling). */
  className?: string;
  /** Classes for the edit <input/> (defaults to a dark-theme inline input). */
  inputClassName?: string;
  /** Hide the edit affordance entirely. */
  disabled?: boolean;
  /** For aria labels, e.g. "character name". */
  label?: string;
  maxLength?: number;
};

/**
 * Click the name to rename. Enter saves, Esc cancels.
 * Shared across group / character / location modals.
 */
export function EditableEntityName({
  name,
  onSave,
  className,
  inputClassName,
  disabled = false,
  label = 'name',
  maxLength = 200,
}: EditableEntityNameProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep display in sync when parent renames from elsewhere.
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  const start = () => {
    if (disabled) return;
    setValue(name);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(name);
  };

  const commit = async () => {
    const next = value.trim();
    if (!next || next === name.trim()) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    if (disabled) {
      return <span className={className}>{name}</span>;
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
        aria-label={`Edit ${label}`}
        title="Click to rename"
        className="group/edit inline-flex max-w-full cursor-text items-center gap-2 min-w-0 rounded-lg text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 px-1.5 -mx-1.5 py-1"
      >
        <span
          className={`${className ?? ''} border-b border-dashed border-white/30 group-hover/edit:border-white/60`}
        >
          {name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50 group-hover/edit:border-white/25 group-hover/edit:text-white/80">
          <Pencil className="h-3 w-3" aria-hidden />
          Edit
        </span>
      </button>
    );
  }

  return (
    <span className="inline-flex min-w-0 w-full max-w-full flex-wrap items-center gap-2">
      <input
        autoFocus
        value={value}
        disabled={saving}
        maxLength={maxLength}
        aria-label={`Edit ${label}`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={
          inputClassName ??
          'min-w-0 flex-1 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-inherit font-inherit text-white outline-none focus:border-primary/60'
        }
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void commit();
        }}
        disabled={saving}
        aria-label={`Save ${label}`}
        title="Save"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          cancel();
        }}
        disabled={saving}
        aria-label={`Cancel editing ${label}`}
        title="Cancel"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white/85 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
      {error && <span className="w-full text-xs text-red-400">{error}</span>}
    </span>
  );
}
