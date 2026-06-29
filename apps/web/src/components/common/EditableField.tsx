import { useState, type ReactNode } from 'react';
import { Check, X, Pencil, Loader2 } from 'lucide-react';

import { FieldSourceBadge, type FieldSource } from './FieldSourceBadge';

export type EditableFieldOption = { value: string; label: string };

type EditableFieldProps = {
  label: string;
  /** Current value (raw). Empty/null shows the empty hint. */
  value?: string | null;
  /** Human-readable display for the current value (defaults to value). */
  displayValue?: string | null;
  source?: FieldSource;
  /** Persist the new value. Throw to surface an inline error and keep editing open. */
  onSave: (next: string) => Promise<void> | void;
  variant?: 'text' | 'select';
  options?: EditableFieldOption[];
  placeholder?: string;
  /** Shown when there's no value (e.g. "Ask in chat"). */
  emptyHint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  maxLength?: number;
};

/**
 * A labeled, inline-editable field with a provenance badge. Auto-populated values
 * show an "Auto" badge; saving an edit marks the field confirmed (the caller is
 * responsible for stamping the `_source`). Mobile-friendly: full-width controls,
 * large tap targets, single-column friendly.
 */
export function EditableField({
  label,
  value,
  displayValue,
  source = 'unknown',
  onSave,
  variant = 'text',
  options = [],
  placeholder,
  emptyHint = 'Not set',
  icon,
  disabled = false,
  maxLength = 200,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasValue = Boolean(value && value.trim());
  const shown = (displayValue ?? value ?? '').trim();

  const start = () => {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const commit = async () => {
    const next = draft.trim();
    if (next === (value ?? '').trim()) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</span>
        <FieldSourceBadge source={source} showLabel={false} className="ml-auto" />
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          {variant === 'select' ? (
            <select
              autoFocus
              value={draft}
              disabled={saving}
              aria-label={`Edit ${label}`}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-white/20 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-primary/60"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              value={draft}
              disabled={saving}
              maxLength={maxLength}
              placeholder={placeholder}
              aria-label={`Edit ${label}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              }}
              className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-white/20 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-primary/60"
            />
          )}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            aria-label={`Save ${label}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label={`Cancel editing ${label}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={disabled ? undefined : start}
          disabled={disabled}
          aria-label={`Edit ${label}`}
          className="group/edit flex w-full items-center gap-2 rounded-lg border border-transparent px-0 py-1 text-left hover:border-white/10 hover:bg-white/[0.03] disabled:cursor-default"
        >
          <span className={`min-w-0 flex-1 truncate text-sm ${hasValue ? 'text-white' : 'text-white/35 italic'}`}>
            {hasValue ? shown : emptyHint}
          </span>
          {!disabled && (
            <Pencil className="h-3.5 w-3.5 shrink-0 text-white/30 opacity-0 transition group-hover/edit:opacity-100" aria-hidden />
          )}
        </button>
      )}

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
