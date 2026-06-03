import { useState } from 'react';
import { X, BookOpen, Loader2, Calendar, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { fetchJson } from '../../../lib/api';

type NarrativeResult = {
  narrative: { summary: string; sequence: string[] };
  eventCount: number;
  timeRange: { start: string; end: string };
  gaps?: Array<{ start: string; end: string; days: number }>;
  patterns?: string[];
};

const ERA_PRESETS = [
  { label: 'Last 3 months', months: 3 },
  { label: 'Last 6 months', months: 6 },
  { label: 'This year', months: 12 },
  { label: 'Last 2 years', months: 24 },
];

interface ChronologyNarrativeModalProps {
  onClose: () => void;
}

export const ChronologyNarrativeModal = ({ onClose }: ChronologyNarrativeModalProps) => {
  const [result, setResult] = useState<NarrativeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState(6);
  const [showSequence, setShowSequence] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setShowSequence(false);
    try {
      const end = new Date().toISOString();
      const start = new Date();
      start.setMonth(start.getMonth() - selectedMonths);
      const data = await fetchJson<NarrativeResult & { error?: string }>(
        `/api/chronology/narrative?start_date=${start.toISOString()}&end_date=${end}&limit=80`
      );
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError('Failed to generate narrative. Make sure there are journal entries in this time range.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto bg-gradient-to-br from-black via-purple-950/20 to-black border-purple-500/30"
        onClose={onClose}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 flex-1">
            <BookOpen className="w-5 h-5 text-purple-400" />
            <DialogTitle className="text-white text-lg">Your Story, In Narrative</DialogTitle>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2 h-8 w-8" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Era picker */}
          <div>
            <p className="text-xs text-white/50 mb-2">Choose an era to narrate:</p>
            <div className="flex flex-wrap gap-2">
              {ERA_PRESETS.map(preset => (
                <button
                  key={preset.months}
                  type="button"
                  onClick={() => setSelectedMonths(preset.months)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    selectedMonths === preset.months
                      ? 'bg-purple-500/30 border-purple-500/50 text-purple-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={generate}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating narrative…</>
            ) : (
              <><BookOpen className="h-4 w-4 mr-2" /> Generate Narrative</>
            )}
          </Button>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Time range + event count */}
              <div className="flex items-center gap-3 text-xs text-white/40">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {new Date(result.timeRange.start).toLocaleDateString()} –{' '}
                  {new Date(result.timeRange.end).toLocaleDateString()}
                </span>
                <span className="text-white/20">·</span>
                <span>{result.eventCount} events</span>
              </div>

              {/* Narrative summary */}
              <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-950/15">
                <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">
                  {result.narrative.summary}
                </p>
              </div>

              {/* Patterns */}
              {result.patterns && result.patterns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-white/60 mb-2">Recurring Patterns</p>
                  <div className="flex flex-wrap gap-2">
                    {result.patterns.map((p, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded border border-purple-500/25 text-purple-300/80 bg-purple-950/20">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {result.gaps && result.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-white/60 mb-2">Gaps in Record</p>
                  <div className="space-y-1">
                    {result.gaps.slice(0, 3).map((gap, i) => (
                      <p key={i} className="text-xs text-white/40">
                        {new Date(gap.start).toLocaleDateString()} → {new Date(gap.end).toLocaleDateString()} ({gap.days} days)
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Sequence toggle */}
              {result.narrative.sequence?.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowSequence(s => !s)}
                    className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    {showSequence ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showSequence ? 'Hide' : 'Show'} event sequence ({result.narrative.sequence.length} events)
                  </button>
                  {showSequence && (
                    <div className="mt-2 space-y-1 pl-3 border-l border-white/10">
                      {result.narrative.sequence.map((s, i) => (
                        <p key={i} className="text-xs text-white/55 leading-snug">{s}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
