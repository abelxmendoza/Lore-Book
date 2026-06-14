import { useMemo, useState } from 'react';
import { Plus, X, Loader2, Save } from 'lucide-react';
import { Button } from '../ui/button';
import {
  PLACE_TAXONOMY,
  PLACE_CATEGORY_LABELS,
  PLACE_SIGNIFICANCE_TYPES,
  PLACE_SIGNIFICANCE_LABELS,
  SUGGESTED_PLACE_TAGS,
  formatPlaceType,
  type PlaceType,
  type PlaceSignificance,
} from '../../lib/placeTypes';

export type PlaceProfileDraft = {
  type: string;
  place_tags: string[];
  place_significance: PlaceSignificance[];
};

type Props = {
  initial: PlaceProfileDraft;
  onSave: (draft: PlaceProfileDraft) => Promise<void>;
  onCancel?: () => void;
};

export function PlaceProfileEditor({ initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<PlaceProfileDraft>(initial);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const typeOptions = useMemo(
    () =>
      (Object.entries(PLACE_TAXONOMY) as [keyof typeof PLACE_TAXONOMY, readonly PlaceType[]][]).flatMap(
        ([cat, types]) =>
          types.map(t => ({
            value: t,
            label: formatPlaceType(t),
            group: PLACE_CATEGORY_LABELS[cat],
          })),
      ),
    [],
  );

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    setDraft(d => ({
      ...d,
      place_tags: d.place_tags.some(x => x.toLowerCase() === t.toLowerCase())
        ? d.place_tags
        : [...d.place_tags, t],
    }));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setDraft(d => ({ ...d, place_tags: d.place_tags.filter(t => t !== tag) }));
  };

  const toggleSignificance = (sig: PlaceSignificance) => {
    setDraft(d => ({
      ...d,
      place_significance: d.place_significance.includes(sig)
        ? d.place_significance.filter(s => s !== sig)
        : [...d.place_significance, sig],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-white/4 border border-teal-500/25 p-4 space-y-4">
      <p className="text-xs font-semibold text-teal-300/90 uppercase tracking-wider">Edit place profile</p>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 block">Place type</label>
        <select
          value={draft.type}
          onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
          className="w-full px-3 py-2 bg-black/60 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        >
          <option value="">Select type…</option>
          {Array.from(new Set(typeOptions.map(o => o.group))).map(group => (
            <optgroup key={group} label={group}>
              {typeOptions.filter(o => o.group === group).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 block">Place tags</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draft.place_tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-200"
            >
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="text-teal-300/60 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
            placeholder="Add tag…"
            className="flex-1 px-3 py-1.5 bg-black/60 border border-white/15 rounded-lg text-white text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => addTag(tagInput)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {SUGGESTED_PLACE_TAGS.filter(t => !draft.place_tags.includes(t)).slice(0, 8).map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/45 hover:border-teal-500/30 hover:text-teal-300"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5 block">Personal significance</label>
        <div className="flex flex-wrap gap-1.5">
          {PLACE_SIGNIFICANCE_TYPES.map(sig => {
            const active = draft.place_significance.includes(sig);
            return (
              <button
                key={sig}
                type="button"
                onClick={() => toggleSignificance(sig)}
                className={`text-[10px] px-2 py-1 rounded-full border transition ${
                  active
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                    : 'border-white/10 text-white/45 hover:border-white/25'
                }`}
              >
                {PLACE_SIGNIFICANCE_LABELS[sig]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
