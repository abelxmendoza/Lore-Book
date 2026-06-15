import { useState } from 'react';
import { X, Check, Loader2, Sparkles } from 'lucide-react';

type MessageCorrectionModalProps = {
  originalContent: string;
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (newContent: string, reason?: string) => void;
};

/**
 * Lightweight editor for correcting something the user already said. Saving
 * re-derives what Lore Book knows from this message (old interpretations are
 * retired, the corrected text is re-ingested).
 */
export const MessageCorrectionModal = ({
  originalContent,
  saving,
  error,
  onCancel,
  onSave,
}: MessageCorrectionModalProps) => {
  const [content, setContent] = useState(originalContent);
  const [reason, setReason] = useState('');

  const unchanged = content.trim() === originalContent.trim();
  const empty = content.trim().length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Correct message"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Correct what you said</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1 text-white/50 hover:text-white disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-white/50">
          Editing this updates what Lore Book knows: the old version is kept in history,
          and the corrected text is re-read so your knowledge base stays accurate.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
          rows={5}
          className="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
          placeholder="What you actually meant…"
          autoFocus
        />

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={saving}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          placeholder="Why the change? (optional — e.g. 'typo', 'wrong name')"
        />

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
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
            onClick={() => onSave(content.trim(), reason.trim() || undefined)}
            disabled={saving || unchanged || empty}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Updating knowledge…
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
