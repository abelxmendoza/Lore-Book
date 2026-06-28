import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

import { fetchJson } from '../../../lib/api';
import type { ChatSource, Message } from './ChatMessage';

const TARGET_TYPE_LABELS: Record<string, string> = {
  entry: 'Entry',
  chapter: 'Chapter',
  character: 'Character',
  location: 'Location',
  organization: 'Organization',
  skill: 'Skill',
  task: 'Task',
  hqi: 'Smart search',
  fabric: 'Related knowledge',
  assistant_response: 'Response',
};

type TargetOption = {
  type: string;
  id?: string;
  title: string;
  subtitle?: string;
};

type KnowledgeCorrectionModalProps = {
  message: Message;
  onCancel: () => void;
  onSaved?: () => void;
};

function labelForType(type: string): string {
  return TARGET_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function sourceToTarget(source: ChatSource): TargetOption {
  return {
    type: source.type,
    id: source.id,
    title: source.title,
    subtitle: source.snippet,
  };
}

export const KnowledgeCorrectionModal = ({
  message,
  onCancel,
  onSaved,
}: KnowledgeCorrectionModalProps) => {
  const targets = useMemo<TargetOption[]>(() => {
    const byKey = new Map<string, TargetOption>();

    for (const source of message.sources ?? []) {
      const target = sourceToTarget(source);
      byKey.set(`${target.type}:${target.id ?? target.title}`, target);
    }

    for (const entity of message.mentionedEntities ?? []) {
      byKey.set(`${entity.type}:${entity.id}`, {
        type: entity.type,
        id: entity.id,
        title: entity.name,
        subtitle: 'Mentioned in this response',
      });
    }

    byKey.set('assistant_response:self', {
      type: 'assistant_response',
      id: message.id,
      title: 'This response',
      subtitle: 'Use when the answer is wrong but no specific source is listed',
    });

    return [...byKey.values()];
  }, [message]);

  const [selectedKey, setSelectedKey] = useState('0');
  const [correctedText, setCorrectedText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTarget = targets[Number(selectedKey)] ?? targets[0];

  const handleSave = async () => {
    if (!correctedText.trim() || !selectedTarget) return;
    setSaving(true);
    setError(null);

    try {
      await fetchJson<{ success: boolean; error?: string }>('/api/correction-dashboard/manual', {
        method: 'POST',
        body: JSON.stringify({
          target_type: selectedTarget.type,
          target_id: selectedTarget.id,
          target_title: selectedTarget.title,
          original_text: message.content,
          corrected_text: correctedText.trim(),
          reason: reason.trim() || undefined,
          source_message_id: message.id,
          metadata: {
            source: 'knowledge_correction_modal',
            response_excerpt: message.content.slice(0, 1000),
          },
        }),
      });
      setSaved(true);
      onSaved?.();
      window.setTimeout(onCancel, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save correction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Correct app knowledge"
    >
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Correct app knowledge</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1 text-white/50 hover:text-white disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-white/60">
            Affected knowledge
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400/40 disabled:opacity-60"
            >
              {targets.map((target, index) => (
                <option key={`${target.type}:${target.id ?? target.title}`} value={String(index)}>
                  {labelForType(target.type)}: {target.title}
                </option>
              ))}
            </select>
          </label>

          {selectedTarget?.subtitle && (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
              {selectedTarget.subtitle}
            </p>
          )}

          <label className="block text-xs font-medium text-white/60">
            Correct information
            <textarea
              value={correctedText}
              onChange={(event) => setCorrectedText(event.target.value)}
              disabled={saving || saved}
              rows={5}
              className="mt-1 w-full resize-y rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400/40 disabled:opacity-60"
              placeholder="Write the precise version the app should remember."
              autoFocus
            />
          </label>

          <label className="block text-xs font-medium text-white/60">
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving || saved}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white/80 outline-none focus:ring-2 focus:ring-amber-400/40 disabled:opacity-60"
              placeholder="Optional context, e.g. wrong person, outdated fact, bad inference"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        {saved && (
          <p className="mt-3 flex items-center gap-2 text-xs text-green-400">
            <Check className="h-3.5 w-3.5" />
            Correction saved and queued as a training signal.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white/70 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved || !correctedText.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Save correction
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
