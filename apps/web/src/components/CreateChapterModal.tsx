import { useMemo, useState } from 'react';
import { Flame, X } from 'lucide-react';

import type { Chapter } from '../hooks/useLoreKeeper';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type CreateChapterModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    startDate: string;
    endDate?: string | null;
    description?: string | null;
  }) => Promise<Chapter>;
};

export const CreateChapterModal = ({ open, onClose, onCreate }: CreateChapterModalProps) => {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isValid = useMemo(() => {
    if (!title.trim()) return false;
    if (!startDate) return false;
    if (endDate && new Date(endDate) < new Date(startDate)) return false;
    return true;
  }, [title, startDate, endDate]);

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Please fill in required fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        startDate,
        endDate: endDate || null,
        description: description.trim() || null
      });
      setTitle('');
      setStartDate('');
      setEndDate('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chapter');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-full max-w-xl rounded-2xl border border-primary/40 bg-gradient-to-br from-black via-purple-950/80 to-black p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-primary/70">Create Chapter</p>
            <h3 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
              <Flame className="h-6 w-6 text-amber-400 flicker" />
              New Chronicle
            </h3>
          </div>
          <button onClick={onClose} className="text-white/60 transition hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs uppercase text-white/50">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Arc name" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-white/50">Start Date</label>
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase text-white/50">End Date (optional)</label>
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-white/50">Description</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this chapter about?"
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Creating…' : 'Create Chapter'}
          </Button>
        </div>
      </div>
    </div>
  );
};
