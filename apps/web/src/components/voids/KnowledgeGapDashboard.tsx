import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Calendar, Clock, AlertCircle, Sparkles, ArrowRight, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

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
  const [significanceFilter, setSignificanceFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [voidData, setVoidData] = useState<{ voids: VoidPeriod[]; totalGaps: number } | null>(null);
  const [statsData, setStatsData] = useState<VoidStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [voidsResult, statsResult] = await Promise.all([
          fetchJson<{ voids: VoidPeriod[]; totalGaps: number }>('/api/voids/gaps'),
          fetchJson<VoidStats>('/api/voids/stats'),
        ]);
        setVoidData(voidsResult);
        setStatsData(statsResult);
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
    loadData();
  }, []);

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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Gaps</h1>
          <p className="text-white/60 mt-1">
            {stats?.totalGaps || 0} periods where your story is missing
          </p>
        </div>
      </div>

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
