import { useState, useEffect } from 'react';
import { Eye, Filter, TrendingDown, TrendingUp, Users, Calendar, AlertTriangle } from 'lucide-react';
import { PerceptionEntryCard } from './PerceptionEntryCard';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry, PerceptionSource, PerceptionStatus } from '../../types/perception';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';
import { mockPerceptions } from './PerceptionsView';

// Re-export mock data for service
export { mockPerceptions };

/**
 * Perception Lens View
 * HARD RULE: This is a view mode, not a data structure
 * Shows only perception_entries grouped by subject, era, confidence level
 * 
 * Why: Seeing all your beliefs laid out is humbling and powerful.
 * You'll spot patterns: projection, repeated assumptions, social misinformation loops.
 * 
 * Outcome: Lorebook becomes a mirror, not just a log. Turns gossip into self-awareness.
 */
export const PerceptionLensView = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [perceptions, setPerceptions] = useState<PerceptionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.perceptions(mockPerceptions);
  }, []);
  
  // Filters
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<PerceptionSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PerceptionStatus | 'all'>('all');
  const [confidenceMin, setConfidenceMin] = useState<number>(0);
  const [confidenceMax, setConfidenceMax] = useState<number>(1);
  const [timeStart, setTimeStart] = useState<string>('');
  const [timeEnd, setTimeEnd] = useState<string>('');

  // Grouping mode
  const [groupBy, setGroupBy] = useState<'subject' | 'era' | 'confidence' | 'none'>('subject');

  useEffect(() => {
    void loadPerceptions();
  }, [subjectFilter, sourceFilter, statusFilter, confidenceMin, confidenceMax, timeStart, timeEnd, isMockDataEnabled]);

  const loadPerceptions = async () => {
    setLoading(true);
    try {
      const data = await perceptionApi.getPerceptionLens({
        subject_alias: subjectFilter || undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        confidence_min: confidenceMin,
        confidence_max: confidenceMax,
        timeStart: timeStart || undefined,
        timeEnd: timeEnd || undefined
      });
      
      // Use mock data service to determine what to show
      let finalData = data;
      if (data.length === 0) {
        const result = mockDataService.getWithFallback.perceptions(null, isMockDataEnabled);
        finalData = result.data;
      }
      
      // Apply filters to mock data if using it
      if (data.length === 0 && isMockDataEnabled) {
        if (subjectFilter) {
          finalData = finalData.filter(p => p.subject_alias.toLowerCase().includes(subjectFilter.toLowerCase()));
        }
        if (sourceFilter !== 'all') {
          finalData = finalData.filter(p => p.source === sourceFilter);
        }
        if (statusFilter !== 'all') {
          finalData = finalData.filter(p => p.status === statusFilter);
        }
        if (confidenceMin > 0 || confidenceMax < 1) {
          finalData = finalData.filter(p => p.confidence_level >= confidenceMin && p.confidence_level <= confidenceMax);
        }
        if (timeStart) {
          finalData = finalData.filter(p => p.timestamp_heard >= timeStart);
        }
        if (timeEnd) {
          finalData = finalData.filter(p => p.timestamp_heard <= timeEnd);
        }
      }
      
      setPerceptions(finalData);
    } catch (error) {
      console.error('Failed to load perception lens:', error);
      // Fallback to mock data on error if toggle is enabled
      if (!isMockDataEnabled) {
        setPerceptions([]);
        return;
      }
      const result = mockDataService.getWithFallback.perceptions(null, isMockDataEnabled);
      let mockData = [...result.data];
      if (subjectFilter) {
        mockData = mockData.filter(p => p.subject_alias.toLowerCase().includes(subjectFilter.toLowerCase()));
      }
      if (sourceFilter !== 'all') {
        mockData = mockData.filter(p => p.source === sourceFilter);
      }
      if (statusFilter !== 'all') {
        mockData = mockData.filter(p => p.status === statusFilter);
      }
      if (confidenceMin > 0 || confidenceMax < 1) {
        mockData = mockData.filter(p => p.confidence_level >= confidenceMin && p.confidence_level <= confidenceMax);
      }
      if (timeStart) {
        mockData = mockData.filter(p => p.timestamp_heard >= timeStart);
      }
      if (timeEnd) {
        mockData = mockData.filter(p => p.timestamp_heard <= timeEnd);
      }
      setPerceptions(mockData);
    } finally {
      setLoading(false);
    }
  };

  // Group perceptions
  const groupedPerceptions = () => {
    if (groupBy === 'none') {
      return { 'All Perceptions': perceptions };
    }

    const groups: Record<string, PerceptionEntry[]> = {};

    if (groupBy === 'subject') {
      perceptions.forEach(p => {
        const key = p.subject_alias || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
    } else if (groupBy === 'confidence') {
      perceptions.forEach(p => {
        const level = p.confidence_level;
        let key = 'High Confidence (70-100%)';
        if (level < 0.4) key = 'Low Confidence (0-40%)';
        else if (level < 0.7) key = 'Medium Confidence (40-70%)';
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
    } else if (groupBy === 'era') {
      // Group by year
      perceptions.forEach(p => {
        const year = new Date(p.timestamp_heard).getFullYear();
        const key = `${year}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });
    }

    return groups;
  };

  const groups = groupedPerceptions();
  const groupKeys = Object.keys(groups).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Eye className="h-6 w-6 text-primary" />
            Perception Lens
          </h2>
          <p className="text-sm text-white/60 mt-1">
            See all your beliefs laid out—spot patterns, projection, repeated assumptions
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-black/40 border border-border/50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/50" />
          <span className="text-sm font-medium text-white/70">Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Subject Filter */}
          <div>
            <label className="text-xs text-white/70 mb-1 block">Subject</label>
            <Input
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              placeholder="Filter by person..."
              className="bg-black/60 border-border/50 text-white text-sm h-8"
            />
          </div>

          {/* Source Filter */}
          <div>
            <label className="text-xs text-white/70 mb-1 block">Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="w-full bg-black/60 border-border/50 text-white text-sm h-8 rounded px-2"
            >
              <option value="all">All Sources</option>
              <option value="overheard">Overheard</option>
              <option value="told_by">Told By</option>
              <option value="rumor">Rumor</option>
              <option value="social_media">Social Media</option>
              <option value="intuition">Intuition</option>
              <option value="assumption">Assumption</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-xs text-white/70 mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-black/60 border-border/50 text-white text-sm h-8 rounded px-2"
            >
              <option value="all">All Statuses</option>
              <option value="unverified">Unverified</option>
              <option value="confirmed">Confirmed</option>
              <option value="disproven">Disproven</option>
              <option value="retracted">Retracted</option>
            </select>
          </div>

          {/* Confidence Range */}
          <div>
            <label className="text-xs text-white/70 mb-1 block">Confidence: {Math.round(confidenceMin * 100)}% - {Math.round(confidenceMax * 100)}%</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={confidenceMin}
                onChange={(e) => setConfidenceMin(parseFloat(e.target.value))}
                className="flex-1"
              />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={confidenceMax}
                onChange={(e) => setConfidenceMax(parseFloat(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>

          {/* Time Range */}
          <div>
            <label className="text-xs text-white/70 mb-1 block">Time Start</label>
            <Input
              type="date"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              className="bg-black/60 border-border/50 text-white text-sm h-8"
            />
          </div>

          <div>
            <label className="text-xs text-white/70 mb-1 block">Time End</label>
            <Input
              type="date"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              className="bg-black/60 border-border/50 text-white text-sm h-8"
            />
          </div>
        </div>

        {/* Group By */}
        <div>
          <label className="text-xs text-white/70 mb-1 block">Group By</label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={groupBy === 'subject' ? 'default' : 'outline'}
              onClick={() => setGroupBy('subject')}
              className="text-xs"
            >
              <Users className="h-3 w-3 mr-1" />
              Subject
            </Button>
            <Button
              size="sm"
              variant={groupBy === 'era' ? 'default' : 'outline'}
              onClick={() => setGroupBy('era')}
              className="text-xs"
            >
              <Calendar className="h-3 w-3 mr-1" />
              Era
            </Button>
            <Button
              size="sm"
              variant={groupBy === 'confidence' ? 'default' : 'outline'}
              onClick={() => setGroupBy('confidence')}
              className="text-xs"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Confidence
            </Button>
            <Button
              size="sm"
              variant={groupBy === 'none' ? 'default' : 'outline'}
              onClick={() => setGroupBy('none')}
              className="text-xs"
            >
              None
            </Button>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-orange-200/90">
          <p className="font-medium mb-1">This is your perception, not objective truth</p>
          <p className="text-orange-200/70">
            Use this lens to spot patterns: projection, repeated assumptions, social misinformation loops.
            Lorebook becomes a mirror, not just a log.
          </p>
        </div>
      </div>

      {/* Perceptions List (Grouped) */}
      {loading ? (
        <div className="text-center py-12 text-white/60">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading perception lens...</p>
        </div>
      ) : perceptions.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No perceptions found</p>
          <p className="text-sm">Adjust filters to see your beliefs laid out.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupKeys.map(groupKey => (
            <div key={groupKey} className="space-y-3">
              <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                {groupBy === 'subject' && <Users className="h-4 w-4" />}
                {groupBy === 'era' && <Calendar className="h-4 w-4" />}
                {groupBy === 'confidence' && <TrendingUp className="h-4 w-4" />}
                {groupKey}
                <span className="text-sm text-white/50 font-normal">
                  ({groups[groupKey].length} {groups[groupKey].length === 1 ? 'perception' : 'perceptions'})
                </span>
              </h3>
              <div className="space-y-3">
                {groups[groupKey].map((perception) => (
                  <PerceptionEntryCard
                    key={perception.id}
                    perception={perception}
                    showSubject={groupBy !== 'subject'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
