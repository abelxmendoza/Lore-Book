// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';

interface DeleteAccountDialogProps {
  onConfirm: () => Promise<void>;
  onClose?: () => void;
}

export const DeleteAccountDialog = ({ onConfirm, onClose }: DeleteAccountDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState(false);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm();
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-500 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10"
      >
        Delete Account
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/60 bg-[#12010f] p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white">Delete account</h2>
            <p className="mt-2 text-sm text-white/70">
              This will permanently delete all journal entries, tasks, chapters, timelines, and characters. Archives will be destroyed and your session will be terminated.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-red-500/70 bg-black"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />
              I understand this action is irreversible.
            </label>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={close}
                className="rounded-md border border-border/60 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={!ack || loading}
                onClick={handleDelete}
                className="rounded-md border border-red-500 bg-red-600/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
