import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { FamilyMember } from '../../types/socialRoles';

/** Base relations the user can assign — "{member} is my {relation}". Must match
 *  the server's RELATION_GENERATION allow-list in familyTreeService. */
const RELATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'parent', label: 'Parent' },
  { value: 'step_parent', label: 'Step-parent' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'child', label: 'Child' },
  { value: 'step_child', label: 'Step-child' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'half_sibling', label: 'Half-sibling' },
  { value: 'step_sibling', label: 'Step-sibling' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'niece', label: 'Niece' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'in_law', label: 'In-law' },
  { value: 'related', label: 'Other relative' },
];

const SIDE_OPTIONS: Array<{ value: '' | 'maternal' | 'paternal' | 'both' | 'other'; label: string }> = [
  { value: '', label: 'Unspecified' },
  { value: 'maternal', label: "Mother's side" },
  { value: 'paternal', label: "Father's side" },
  { value: 'both', label: 'Both' },
  { value: 'other', label: 'Other' },
];

export interface RelationshipEdit {
  relation: string;
  side?: 'maternal' | 'paternal' | 'both' | 'other';
  /** Explicit parent to connect this node to. Empty = let LoreBook infer. */
  connectsToId?: string;
}

export function RelationshipEditor({
  member,
  members = [],
  onSave,
  onClose,
}: {
  member: FamilyMember;
  /** All tree members, used to populate the "connects to" (parent) picker. */
  members?: FamilyMember[];
  onSave: (edit: RelationshipEdit) => Promise<void> | void;
  onClose: () => void;
}) {
  const [relation, setRelation] = useState<string>(
    RELATION_OPTIONS.some((o) => o.value === member.relation) ? member.relation : 'related',
  );
  const [side, setSide] = useState<'' | 'maternal' | 'paternal' | 'both' | 'other'>(member.side ?? '');
  const [connectsToId, setConnectsToId] = useState<string>(member.parent_id ?? '');
  const [saving, setSaving] = useState(false);

  // Candidate parents: every other node, older generations first. The user can
  // pick the real parent so the connector is drawn correctly.
  const parentCandidates = members
    .filter((m) => m.id !== member.id && !m.is_placeholder)
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name));

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ relation, side: side || undefined, connectsToId: connectsToId || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#15131f] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Edit relationship</h3>
            <p className="mt-0.5 text-xs text-white/50">
              How is <span className="text-white/80">{member.name}</span> related to you?
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-[11px] font-medium uppercase tracking-wide text-white/45">Relationship</label>
        <select
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          aria-label="Relationship"
          className="mt-1 mb-3 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/60 focus:outline-none"
        >
          {RELATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="block text-[11px] font-medium uppercase tracking-wide text-white/45">Family side</label>
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as typeof side)}
          aria-label="Family side"
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/60 focus:outline-none"
        >
          {SIDE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-white/45">
          Connects to (parent)
        </label>
        <select
          value={connectsToId}
          onChange={(e) => setConnectsToId(e.target.value)}
          aria-label="Connects to"
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-emerald-400/60 focus:outline-none"
        >
          <option value="">Auto — let LoreBook decide</option>
          {parentCandidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}{m.relation_label ? ` · ${m.relation_label}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-white/35">
          Pick who this person descends from to fix the line in the graph, or leave on Auto.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save correction
          </button>
        </div>
      </div>
    </div>
  );
}
