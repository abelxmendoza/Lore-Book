import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Calendar, Clock, AlertCircle, Sparkles, ArrowRight, Filter, HelpCircle, X, MessageCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { fetchTrustOverview } from '../../api/trust';
import { TrustCoveragePanel } from '../trust/TrustCoveragePanel';
import { useMockData } from '../../contexts/MockDataContext';
import {
  MOCK_ENTITY_KNOWLEDGE_GAPS,
  MOCK_VOID_PERIODS,
  MOCK_VOID_STATS,
} from '../../mocks/knowledgeGaps';

interface EntityKnowledgeGap {
  id: string;
  gap_type: 'unknown_entity' | 'sparse_entity';
  label: string;
  prompt: string;
  created_at: string;
}

interface VoidPeriod {
  id: string;
  start: string;
  end: string;
  durationDays: number;
  type: 'short_gap' | 'medium_gap' | 'long_silence' | 'void';
  significance: 'low' | 'medium' | 'high';
  prompts: string[];
  engagementScore: number;
  context?: {
    beforePeriod?: string;
    afterPeriod?: string;
    estimatedActivity?: string;
    surroundingThemes?: string[];
  };
}

interface VoidStats {
  totalGaps: number;
  totalMissingDays: number;
  averageGapDuration: number;
  mostSignificantGap: VoidPeriod | null;
  coveragePercentage: number;
  timelineSpan: {
    start: string;
    end: string;
    totalDays: number;
  } | null;
}

export const KnowledgeGapDashboard: React.FC = () => {
  const { useMockData: isMockData } = useMockData();
  const [significanceFilter, setSignificanceFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [voidData, setVoidData] = useState<{ voids: VoidPeriod[]; totalGaps: number } | null>(null);
  const [statsData, setStatsData] = useState<VoidStats | null>(null);
  const [entityGaps, setEntityGaps] = useState<EntityKnowledgeGap[]>([]);
  const [trustOverview, setTrustOverview] = useState<Awaited<ReturnType<typeof fetchTrustOverview>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        if (isMockData) {
          setVoidData({ voids: MOCK_VOID_PERIODS, totalGaps: MOCK_VOID_STATS.totalGaps });
          setStatsData(MOCK_VOID_STATS);
          setEntityGaps(MOCK_ENTITY_KNOWLEDGE_GAPS);
          setTrustOverview(await fetchTrustOverview());
          return;
        }

        const [voidsResult, statsResult, gapsResult, trustResult] = await Promise.all([
          fetchJson<{ voids: VoidPeriod[]; totalGaps: number }>('/api/voids/gaps'),
          fetchJson<VoidStats>('/api/voids/stats'),
          fetchJson<{ gaps: EntityKnowledgeGap[] }>('/api/voids/knowledge-gaps').catch(() => ({ gaps: [] })),
          fetchTrustOverview().catch(() => null),
        ]);
        setVoidData(voidsResult);
        setStatsData(statsResult);
        setEntityGaps(gapsResult.gaps ?? []);
        setTrustOverview(trustResult);
      } catch (error) {
        console.error('Failed to fetch void data:', error);
        setVoidData({ voids: [], totalGaps: 0 });
        setStatsData({
          totalGaps: 0,
          totalMissingDays: 0,
          averageGapDuration: 0,
          mostSignificantGap: null,
          coveragePercentage: 0,
          timelineSpan: null,
        });
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, [isMockData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/60">Loading knowledge gaps...</p>
      </div>
    );
  }

  const voids = voidData?.voids || [];
  const stats = statsData;

  // Filter voids by significance
  const filteredVoids = significanceFilter === 'all'
    ? voids
    : voids.filter(v => v.significance === significanceFilter);

  const getSignificanceColor = (significance: VoidPeriod['significance']) => {
    switch (significance) {
      case 'high':
        return 'border-red-500/50 bg-red-500/10 text-red-300';
      case 'medium':
        return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300';
      default:
        return 'border-gray-500/50 bg-gray-500/10 text-gray-300';
    }
  };

  const handleFillGap = (voidPeriod: VoidPeriod) => {
    const dateText = format(parseISO(voidPeriod.start), 'yyyy-MM-dd');
    const promptText = voidPeriod.prompts[0] ? encodeURIComponent(voidPeriod.prompts[0]) : '';
    window.location.href = `/?surface=chat&date=${dateText}${promptText ? `&prompt=${promptText}` : ''}`;
  };

  const handleViewOnTimeline = (voidPeriod: VoidPeriod) => {
    window.location.href = `/?surface=timeline&focus=${voidPeriod.start}`;
  };

  const handleTellLorebook = (gap: EntityKnowledgeGap) => {
    window.location.href = `/?surface=chat&prompt=${encodeURIComponent(gap.prompt)}`;
  };

  const handleDismissGap = async (gap: EntityKnowledgeGap) => {
    setEntityGaps(prev => prev.filter(g => g.id !== gap.id));
    try {
      await fetchJson(`/api/voids/knowledge-gaps/${gap.id}/dismiss`, { method: 'PATCH' });
    } catch (error) {
      console.error('Failed to dismiss knowledge gap:', error);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Gaps</h1>
          <p className="text-white/60 mt-1">
            Coverage, unknowns, and {stats?.totalGaps || 0} timeline periods to fill in
          </p>
        </div>
      </div>

      {trustOverview && (
        <TrustCoveragePanel overview={trustOverview} demoMode={isMockData} />
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border border-white/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/60">Total Gaps</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{stats.totalGaps}</p>
            </CardContent>
          </Card>
          <Card className="border border-white/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/60">Missing Days</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{stats.totalMissingDays}</p>
            </CardContent>
          </Card>
          <Card className="border border-white/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/60">Avg Gap Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{stats.averageGapDuration} days</p>
            </CardContent>
          </Card>
          <Card className="border border-white/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-white/60">Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{stats.coveragePercentage}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Things Lorebook doesn't know yet — entity/field gaps from chat */}
      {entityGaps.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-gray-400" />
              Things Lorebook doesn&apos;t know yet
            </h2>
            <p className="text-white/50 text-sm mt-0.5">
              You asked about these, but there&apos;s nothing in your record yet. Tell Lorebook and they become part of your story.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {entityGaps.map(gap => (
              <Card key={gap.id} className="border border-dashed border-gray-500/30 bg-gray-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{gap.label}</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {gap.gap_type === 'unknown_entity'
                          ? 'Not in your record at all'
                          : 'Just a name so far — no facts or events'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismissGap(gap)}
                      className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                      title="Dismiss — don't track this"
                      aria-label={`Dismiss ${gap.label}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleTellLorebook(gap)}
                    className="w-full mt-3 bg-gray-500/15 hover:bg-gray-500/25 text-gray-200 border border-gray-500/40"
                  >
                    <MessageCircle className="w-3 h-3 mr-2" />
                    Tell Lorebook
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-white/60" />
        <span className="text-sm text-white/60">Filter by significance:</span>
        <div className="flex gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={significanceFilter === filter ? 'default' : 'ghost'}
              onClick={() => setSignificanceFilter(filter)}
              className="text-xs"
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Void Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVoids.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-white/60">No gaps found matching your filter.</p>
          </div>
        ) : (
          filteredVoids.map((voidPeriod) => (
            <Card
              key={voidPeriod.id}
              className={`border-2 border-dashed ${getSignificanceColor(voidPeriod.significance)} hover:opacity-90 transition-opacity cursor-pointer`}
              onClick={() => handleViewOnTimeline(voidPeriod)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Missing Period
                  </CardTitle>
                  <span className="text-xs text-white/60">
                    {voidPeriod.engagementScore}% priority
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {format(parseISO(voidPeriod.start), 'MMM d, yyyy')} -{' '}
                      {format(parseISO(voidPeriod.end), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{voidPeriod.durationDays} days</span>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-white/60 mb-2 font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Suggested prompts:
                    </p>
                    <ul className="space-y-1">
                      {voidPeriod.prompts.slice(0, 2).map((prompt, i) => (
                        <li key={i} className="text-xs text-white/70 flex items-start gap-2">
                          <span className="mt-0.5">•</span>
                          <span className="line-clamp-2">{prompt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFillGap(voidPeriod);
                    }}
                    className="w-full mt-3 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/50"
                  >
                    Fill this gap
                    <ArrowRight className="w-3 h-3 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
