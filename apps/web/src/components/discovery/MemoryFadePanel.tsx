import { useState, useEffect, useCallback } from 'react';
import { Ghost, RefreshCw, BookOpen } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface FadingEntry {
  id: string;
  date: string;
  content: string;
  accessibility_score: number | null;
  tags: string[] | null;
  summary: string | null;
}

const FadeBar = ({ score }: { score: number }) => {
  const pct = Math.round((1 - score) * 100);
  const color =
    pct >= 70 ? 'bg-red-500/70' : pct >= 40 ? 'bg-amber-500/60' : 'bg-yellow-400/50';
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">{pct}% faded</span>
    </div>
  );
};

export const MemoryFadePanel = () => {
  const [entries, setEntries] = useState<FadingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [revisiting, setRevisiting] = useState<string | null>(null);
  const [revisited, setRevisited] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJson<{ entries: FadingEntry[] }>('/api/entries/fading?limit=20');
      setEntries(res.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRevisit = async (id: string) => {
    setRevisiting(id);
    try {
      await fetchJson(`/api/entries/${id}`, { method: 'GET' });
      setRevisited(prev => new Set(prev).add(id));
    } catch {
      // best-effort
    } finally {
      setRevisiting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/40 py-8 justify-center">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading fading memories…</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-white/40">
        <Ghost className="h-8 w-8" />
        <p className="text-sm">No fading memories found. All is well remembered.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-white/40">
          Memories ranked by fade — lowest accessibility score first.
        </p>
        <Button variant="ghost" size="sm" onClick={load} className="h-6 px-2 text-xs text-white/40 hover:text-white/70">
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {entries.map(entry => {
        const score = entry.accessibility_score ?? 1;
        const dateStr = entry.date
          ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : '—';
        const preview = (entry.summary || entry.content || '').slice(0, 120);
        const isRevisited = revisited.has(entry.id);

        return (
          <div
            key={entry.id}
            className={`rounded-lg border p-3 transition-all ${
              isRevisited
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-white/10 bg-white/5 hover:bg-white/[0.08]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-[11px] text-white/40">{dateStr}</span>
                  {entry.tags && entry.tags.length > 0 && entry.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 border-white/15 text-white/40">
                      {tag}
                    </Badge>
                  ))}
                  {isRevisited && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-400">
                      revisited
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-white/70 line-clamp-2 leading-snug">{preview}</p>
                <FadeBar score={score} />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleRevisit(entry.id)}
                disabled={revisiting === entry.id}
                className="h-7 px-2 text-xs text-white/40 hover:text-white/80 flex-shrink-0"
                title="Revisit this memory to strengthen it"
              >
                {revisiting === entry.id
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <BookOpen className="h-3 w-3" />
                }
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
