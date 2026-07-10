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
  variant?: 'text' | 'select' | 'multi-select';
  options?: EditableFieldOption[];
  maxSelections?: number;
  placeholder?: string;
  /** Shown when there's no value (e.g. "Ask in chat"). */
  emptyHint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  maxLength?: number;
};

const normalizeMultiValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const splitMultiValue = (value?: string | null): string[] => {
  const seen = new Set<string>();
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const key = normalizeMultiValue(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const joinMultiValue = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = normalizeMultiValue(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
};

const displayLabel = (value: string, options: EditableFieldOption[]) =>
  options.find((option) => normalizeMultiValue(option.value) === normalizeMultiValue(value))?.label ?? value;

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
  maxSelections = 3,
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
  const selectedValues = splitMultiValue(value);
  const draftValues = splitMultiValue(draft);

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
    const next = variant === 'multi-select' ? joinMultiValue(draftValues.slice(0, maxSelections)) : draft.trim();
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
      <div className="mb-1 flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</span>
        <FieldSourceBadge source={source} showLabel={false} className="ml-auto" />
      </div>

      {editing ? (
        <div className={variant === 'multi-select' ? 'space-y-2' : 'grid grid-cols-[1fr_auto_auto] items-center gap-1.5'}>
          {variant === 'select' ? (
            <select
              autoFocus
              value={draft}
              disabled={saving}
              aria-label={`Edit ${label}`}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[40px] min-w-0 rounded-lg border border-white/20 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-primary/60"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : variant === 'multi-select' ? (
            <div className="rounded-lg border border-white/15 bg-black/35 p-2">
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                {options.map((o) => {
                  const optionKey = normalizeMultiValue(o.value);
                  const checked = draftValues.some((v) => normalizeMultiValue(v) === optionKey);
                  const limitReached = Boolean(o.value) && !checked && draftValues.length >= maxSelections;
                  return (
                    <label
                      key={o.value}
                      className={`flex min-h-[38px] min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                        checked
                          ? 'border-primary/45 bg-primary/15 text-white'
                          : limitReached
                            ? 'border-white/5 bg-white/[0.02] text-white/30'
                            : 'border-white/10 bg-white/[0.03] text-white/75'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving || limitReached}
                        onChange={(e) => {
                          if (!o.value) {
                            setDraft('');
                            return;
                          }
                          if (e.target.checked) {
                            setDraft(joinMultiValue([...draftValues, o.value].slice(0, maxSelections)));
                          } else {
                            setDraft(joinMultiValue(draftValues.filter((v) => normalizeMultiValue(v) !== optionKey)));
                          }
                        }}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 truncate">{o.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                {draftValues.length}/{maxSelections} selected
              </p>
            </div>
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
              className="min-h-[40px] min-w-0 rounded-lg border border-white/20 bg-black/50 px-2 py-1.5 text-sm text-white outline-none focus:border-primary/60"
            />
          )}
          <div className={variant === 'multi-select' ? 'flex justify-end gap-1.5' : 'contents'}>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={saving}
              aria-label={`Save ${label}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              aria-label={`Cancel editing ${label}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={disabled ? undefined : start}
          disabled={disabled}
          aria-label={`Edit ${label}`}
          className="group/edit flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-transparent px-0 py-1 text-left hover:border-white/10 hover:bg-white/[0.03] disabled:cursor-default"
        >
          {variant === 'multi-select' && hasValue ? (
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selectedValues.map((item) => (
                <span key={item} className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-xs text-white">
                  {displayLabel(item, options)}
                </span>
              ))}
            </span>
          ) : (
            <span className={`min-w-0 flex-1 truncate text-sm ${hasValue ? 'text-white' : 'text-white/35 italic'}`}>
              {hasValue ? shown : emptyHint}
            </span>
          )}
          {!disabled && (
            <Pencil className="h-3.5 w-3.5 shrink-0 text-white/30 opacity-0 transition group-hover/edit:opacity-100" aria-hidden />
          )}
        </button>
      )}

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
