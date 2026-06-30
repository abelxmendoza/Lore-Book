import { useState } from 'react';
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
 * Inline, manually-editable entity name. Renders the name with a hover pencil;
 * clicking opens an input with save/cancel (Enter saves, Esc cancels). Reused
 * across every entity detail modal so names are editable everywhere.
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

  const start = () => {
    setValue(name);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
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
    return (
      <span className="group/edit inline-flex items-center gap-1.5 min-w-0">
        <span className={className}>{name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={start}
            aria-label={`Edit ${label}`}
            title={`Edit ${label}`}
            className="shrink-0 rounded p-0.5 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white/80 focus:opacity-100 group-hover/edit:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
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
        onClick={() => void commit()}
        disabled={saving}
        aria-label={`Save ${label}`}
        title="Save"
        className="shrink-0 rounded p-1 text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        aria-label={`Cancel editing ${label}`}
        title="Cancel"
        className="shrink-0 rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
