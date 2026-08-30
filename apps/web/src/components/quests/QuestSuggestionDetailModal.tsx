import { useMemo, useState } from 'react';
import { Check, Link2, Loader2, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { QuestSuggestion } from '../../types/quest';

type QuestBookEntry = { id?: string; name: string };

type Props = {
  suggestion: QuestSuggestion;
  questEntries: QuestBookEntry[];
  processing?: boolean;
  onClose: () => void;
  onCreate: (suggestion: QuestSuggestion) => void;
  onMerge: (suggestion: QuestSuggestion, questId: string) => void;
  onDismiss: (suggestion: QuestSuggestion) => void;
};

export function QuestSuggestionDetailModal({ suggestion, questEntries, processing = false, onClose, onCreate, onMerge, onDismiss }: Props) {
  const [title, setTitle] = useState(suggestion.title);
  const [description, setDescription] = useState(suggestion.description ?? '');
  const [mergeQuery, setMergeQuery] = useState('');
  const hits = useMemo(() => {
    const query = mergeQuery.trim().toLowerCase();
    return questEntries.filter((entry) => !query || entry.name.toLowerCase().includes(query)).slice(0, 8);
  }, [mergeQuery, questEntries]);
  const reviewed = { ...suggestion, title: title.trim(), description: description.trim() || undefined };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent onClose={onClose} className="sm:max-w-lg border-amber-500/30 bg-gradient-to-br from-amber-950/50 via-black to-black">
        <DialogHeader>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Quest suggestion review</p>
            <DialogTitle className="mt-1 text-xl leading-snug">Review before adding</DialogTitle>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close suggestion" className="h-9 w-9 text-white/70"><X className="h-4 w-4" /></Button>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          <label className="block space-y-1.5"><span className="text-xs text-white/60">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-amber-400/50 focus:outline-none" /></label>
          <label className="block space-y-1.5"><span className="text-xs text-white/60">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none" /></label>
          {suggestion.evidence?.length ? <section className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">Evidence</p>{suggestion.evidence.slice(0, 5).map((entry, index) => <p key={`${index}-${typeof entry === 'string' ? entry : entry.text}`} className="mt-1 text-xs leading-relaxed text-white/75">“{typeof entry === 'string' ? entry : entry.text}”</p>)}</section> : null}
          {questEntries.length > 0 && <section className="space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-white/80"><Link2 className="h-3.5 w-3.5" />Merge with an existing quest</p><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" /><input value={mergeQuery} onChange={(event) => setMergeQuery(event.target.value)} placeholder="Search your quests…" className="h-9 w-full rounded-md border border-white/15 bg-black/40 pl-8 pr-3 text-sm text-white placeholder:text-white/35 focus:outline-none" /></div><ul className="max-h-32 space-y-1 overflow-y-auto">{hits.map((entry) => <li key={entry.id ?? entry.name}><button type="button" disabled={processing || !entry.id} onClick={() => entry.id && onMerge(reviewed, entry.id)} className="flex w-full items-center justify-between rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left text-sm text-white hover:bg-white/5 disabled:opacity-50"><span className="truncate">{entry.name}</span><span className="text-[11px] text-white/60">Merge</span></button></li>)}</ul></section>}
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 p-4 sm:px-6"><Button type="button" variant="ghost" onClick={() => onDismiss(reviewed)} disabled={processing} className="text-white/65">Not a quest</Button><Button type="button" variant="outline" onClick={onClose} disabled={processing} className="ml-auto">Cancel</Button><Button type="button" onClick={() => onCreate(reviewed)} disabled={processing || !reviewed.title} className="bg-amber-600 hover:bg-amber-500">{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create</Button></div>
      </DialogContent>
    </Dialog>
  );
}
