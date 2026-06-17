import { useState } from 'react';
import { Briefcase, X, CalendarClock, Tag, MessageSquare } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { ProjectCardData } from './ProjectProfileCard';

const STATUSES = ['active', 'paused', 'completed', 'abandoned'];

type Props = {
  project: ProjectCardData;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<ProjectCardData>) => Promise<void>;
  onAskInChat?: (prompt: string) => void;
};

export function ProjectDetailModal({ project, onClose, onPatch, onAskInChat }: Props) {
  const [local, setLocal] = useState(project);
  const isFallback = local.metadata?.source === 'organizations_fallback';
  const readOnly = isFallback;

  const save = async (patch: Partial<ProjectCardData>) => {
    if (readOnly) return;
    await onPatch(local.id, patch);
  };

  return (
    <Modal open onClose={onClose} className="max-w-2xl">
      <div className="flex items-start gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30">
          <Briefcase className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white truncate">{local.name}</h2>
          <p className="text-sm text-white/45 mt-0.5">{local.type?.replace(/_/g, ' ') ?? 'Project'}</p>
        </div>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white p-1" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {readOnly && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          This card is from your communities graph. Create a named project to unlock full editing.
        </div>
      )}

      <label className="block text-xs text-white/40 mb-1" htmlFor="project-modal-status">Status</label>
      <select
        id="project-modal-status"
        disabled={readOnly}
        value={local.status ?? 'active'}
        onChange={(e) => {
          const status = e.target.value;
          setLocal((p) => ({ ...p, status }));
          void save({ status });
        }}
        className="w-full mb-4 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white disabled:opacity-50"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s} className="bg-gray-900">{s}</option>
        ))}
      </select>

      <label className="block text-xs text-white/40 mb-1">Description</label>
      <Textarea
        value={local.description ?? ''}
        disabled={readOnly}
        onChange={(e) => setLocal((p) => ({ ...p, description: e.target.value }))}
        onBlur={() => void save({ description: local.description ?? '' })}
        rows={5}
        placeholder="What is this project about? Goals, scope, why it matters…"
        className="mb-4 bg-black/50 border-white/10 text-white placeholder:text-white/25"
      />

      {(local.started_at || local.updated_at) && (
        <div className="flex items-center gap-2 text-xs text-white/40 mb-4">
          <CalendarClock className="h-3.5 w-3.5" />
          Updated {new Date(local.updated_at).toLocaleDateString()}
        </div>
      )}

      {local.tags && local.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          <Tag className="h-3.5 w-3.5 text-white/40" />
          {local.tags.map((t) => (
            <span key={t} className="text-[11px] rounded-full bg-white/5 text-white/60 px-2 py-0.5">{t}</span>
          ))}
        </div>
      )}

      {onAskInChat && (
        <Button
          type="button"
          variant="default"
          className="w-full gap-2"
          onClick={() => {
            onAskInChat(`Tell me about my project "${local.name}" — status, progress, and what I should focus on.`);
            onClose();
          }}
        >
          <MessageSquare className="h-4 w-4" />
          Ask LoreBook about this project
        </Button>
      )}
    </Modal>
  );
}
