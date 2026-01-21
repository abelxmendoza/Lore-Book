import { useEffect, useState } from 'react';
import { BookOpen, FileText, MessageSquare, Users, MapPin, Calendar, TrendingUp, Target } from 'lucide-react';
import { fetchJson } from '../../lib/api';

interface ContentStats {
  totalJournalEntries: number;
  totalChatMessages: number;
  totalNarrativeAtoms: number;
  totalWordCount: number;
  totalCharacterCount: number;
  timelineSpan: {
    start: string;
    end: string;
    days: number;
    months: number;
    years: number;
  };
  domainCoverage: {
    domain: string;
    atomCount: number;
    entryCount: number;
  }[];
  entityCounts: {
    characters: number;
    locations: number;
    events: number;
    skills: number;
  };
  contentDensity: {
    entriesPerMonth: number;
    entriesPerYear: number;
    averageWordsPerEntry: number;
  };
  mostActivePeriods: {
    month: string;
    year: number;
    entryCount: number;
  }[];
}

interface BookCapacityEstimate {
  availableAtoms: number;
  estimatedPages: {
    minimum: number;
    recommended: number;
    maximum: number;
  };
  estimatedChapters: {
    minimum: number;
    recommended: number;
    maximum: number;
  };
  estimatedWordCount: number;
  canGenerate: boolean;
  reason?: string;
  recommendations: string[];
  progressToTarget?: {
    targetPages: number;
    currentProgress: number;
    neededEntries: number;
    neededAtoms: number;
  };
}

interface LorebookStatsProps {
  onTargetPagesChange?: (targetPages: number) => void;
}

export const LorebookStats = ({ onTargetPagesChange }: LorebookStatsProps) => {
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [capacity, setCapacity] = useState<BookCapacityEstimate | null>(null);
  const [targetPages, setTargetPages] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (targetPages > 0) {
      loadCapacity(targetPages);
    }
  }, [targetPages]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchJson<{ stats: ContentStats }>('/api/biography/stats');
      setStats(result.stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadCapacity = async (pages: number) => {
    try {
      const result = await fetchJson<{ capacity: BookCapacityEstimate }>(
        `/api/biography/capacity/${pages}`
      );
      setCapacity(result.capacity);
    } catch (err) {
      console.error('Failed to load capacity:', err);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading && !stats) {
    return (
      <div className="p-6 text-center text-white/60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2">Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        <p>{error}</p>
        <button
          onClick={loadStats}
          className="mt-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black/40 rounded-lg border border-border/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Lore Statistics
        </h2>
        <button
          onClick={loadStats}
          className="text-xs text-white/60 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Content Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-xs text-white/60">Entries</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalJournalEntries)}</div>
        </div>

        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-xs text-white/60">Messages</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalChatMessages)}</div>
        </div>

        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-xs text-white/60">Atoms</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalNarrativeAtoms)}</div>
        </div>

        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-xs text-white/60">Words</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatNumber(stats.totalWordCount)}</div>
        </div>
      </div>

      {/* Timeline Span */}
      <div className="bg-black/60 rounded-lg p-4 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-white">Timeline Span</h3>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-white/60">Start</div>
            <div className="text-white font-medium">{formatDate(stats.timelineSpan.start)}</div>
          </div>
          <div className="text-white/40">→</div>
          <div className="text-right">
            <div className="text-white/60">End</div>
            <div className="text-white font-medium">{formatDate(stats.timelineSpan.end)}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-white/60">
          <span>{stats.timelineSpan.days} days</span>
          <span>{stats.timelineSpan.months.toFixed(1)} months</span>
          <span>{stats.timelineSpan.years.toFixed(1)} years</span>
        </div>
      </div>

      {/* Entity Counts */}
      <div className="bg-black/60 rounded-lg p-4 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-white">Entities</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-white/60">Characters</div>
            <div className="text-lg font-bold text-white">{stats.entityCounts.characters}</div>
          </div>
          <div>
            <div className="text-xs text-white/60">Locations</div>
            <div className="text-lg font-bold text-white">{stats.entityCounts.locations}</div>
          </div>
          <div>
            <div className="text-xs text-white/60">Events</div>
            <div className="text-lg font-bold text-white">{stats.entityCounts.events}</div>
          </div>
          <div>
            <div className="text-xs text-white/60">Skills</div>
            <div className="text-lg font-bold text-white">{stats.entityCounts.skills}</div>
          </div>
        </div>
      </div>

      {/* Content Density */}
      <div className="bg-black/60 rounded-lg p-4 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-white">Content Density</h3>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-white/60">Per Month</div>
            <div className="text-white font-medium">{stats.contentDensity.entriesPerMonth.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-white/60">Per Year</div>
            <div className="text-white font-medium">{stats.contentDensity.entriesPerYear.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-white/60">Avg Words</div>
            <div className="text-white font-medium">{stats.contentDensity.averageWordsPerEntry.toFixed(0)}</div>
          </div>
        </div>
      </div>

      {/* Book Capacity Calculator */}
      <div className="bg-black/60 rounded-lg p-4 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-white">Book Generation Capacity</h3>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-white/60 mb-2">Target Pages</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={targetPages}
            onChange={(e) => {
              const pages = parseInt(e.target.value) || 0;
              setTargetPages(pages);
              if (onTargetPagesChange) {
                onTargetPagesChange(pages);
              }
            }}
            className="w-full px-3 py-2 bg-black/80 border border-border/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {capacity && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Available Atoms</span>
              <span className="text-white font-medium">{capacity.availableAtoms}</span>
            </div>

            <div>
              <div className="text-xs text-white/60 mb-2">Estimated Pages</div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <div className="text-white/60">Min</div>
                  <div className="text-white font-medium">{capacity.estimatedPages.minimum}</div>
                </div>
                <div>
                  <div className="text-white/60">Recommended</div>
                  <div className="text-white font-medium text-primary">{capacity.estimatedPages.recommended}</div>
                </div>
                <div>
                  <div className="text-white/60">Max</div>
                  <div className="text-white font-medium">{capacity.estimatedPages.maximum}</div>
                </div>
              </div>
            </div>

            {capacity.progressToTarget && (
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-white/60">Progress to {capacity.progressToTarget.targetPages} pages</span>
                  <span className="text-white font-medium">
                    {Math.round(capacity.progressToTarget.currentProgress * 100)}%
                  </span>
                </div>
                <div className="w-full bg-black/80 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, capacity.progressToTarget.currentProgress * 100)}%` }}
                  />
                </div>
                {capacity.progressToTarget.currentProgress < 1 && (
                  <div className="mt-2 text-xs text-white/60">
                    Need {capacity.progressToTarget.neededEntries} more entries ({capacity.progressToTarget.neededAtoms} atoms)
                  </div>
                )}
              </div>
            )}

            {!capacity.canGenerate && capacity.reason && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-sm text-red-300">
                {capacity.reason}
              </div>
            )}

            {capacity.recommendations.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-white/60 mb-1">Recommendations:</div>
                {capacity.recommendations.map((rec, idx) => (
                  <div key={idx} className="text-xs text-white/80 pl-2 border-l-2 border-primary/50">
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Domain Coverage */}
      {stats.domainCoverage.length > 0 && (
        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <h3 className="text-sm font-semibold text-white mb-3">Domain Coverage</h3>
          <div className="space-y-2">
            {stats.domainCoverage.slice(0, 5).map((domain, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-white/80 capitalize">{domain.domain}</span>
                <div className="flex items-center gap-3">
                  <span className="text-white/60">{domain.atomCount} atoms</span>
                  <span className="text-white/60">{domain.entryCount} entries</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most Active Periods */}
      {stats.mostActivePeriods.length > 0 && (
        <div className="bg-black/60 rounded-lg p-4 border border-border/30">
          <h3 className="text-sm font-semibold text-white mb-3">Most Active Periods</h3>
          <div className="space-y-2">
            {stats.mostActivePeriods.slice(0, 5).map((period, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-white/80">
                  {period.month} {period.year}
                </span>
                <span className="text-white font-medium">{period.entryCount} entries</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
