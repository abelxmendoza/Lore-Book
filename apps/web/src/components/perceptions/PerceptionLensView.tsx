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
    user_id: 'mock-user',
    subject_alias: 'Sarah Chen',
    subject_person_id: null,
    content: 'I believed that Sarah was spreading rumors about me to our mutual friends. I heard this from Marcus who said he overheard her talking about me at a party.',
    source: 'told_by',
    source_detail: 'Told by Marcus',
    confidence_level: 0.4,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'This made me feel paranoid and I started avoiding group hangouts. I stopped trusting Sarah completely and questioned all our past interactions.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I believed that Sarah was spreading rumors about me to our mutual friends. I heard this from Marcus who said he overheard her talking about me at a party.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-2',
    user_id: 'mock-user',
    subject_alias: 'Alex Martinez',
    subject_person_id: null,
    content: 'I heard from multiple people that Alex was planning to leave the company soon. People said he was interviewing at other places and had been complaining about management.',
    source: 'rumor',
    source_detail: 'Multiple coworkers mentioned it',
    confidence_level: 0.6,
    sentiment: 'neutral',
    timestamp_heard: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I started preparing for his departure mentally and began documenting processes he handled. I also started networking more with other team members.',
    status: 'confirmed',
    retracted: false,
    resolution_note: 'Confirmed when Alex announced his resignation two weeks later',
    original_content: 'I heard from multiple people that Alex was planning to leave the company soon. People said he was interviewing at other places and had been complaining about management.',
    evolution_notes: [
      '2024-01-15: Confirmed when Alex announced his resignation two weeks later'
    ],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-3',
    user_id: 'mock-user',
    subject_alias: 'Jordan Taylor',
    subject_person_id: null,
    content: 'I believed that Jordan was being manipulative in our friendship. I thought they were only reaching out when they needed something, and I felt used.',
    source: 'intuition',
    source_detail: 'Based on pattern of behavior',
    confidence_level: 0.3,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I distanced myself from Jordan and stopped initiating contact. I felt resentful and started questioning all our past interactions. This affected my ability to trust other friendships too.',
    status: 'disproven',
    retracted: false,
    resolution_note: 'After reflecting, I realized I was projecting my own insecurities. Jordan has always been supportive, and I was misinterpreting their communication style.',
    original_content: 'I believed that Jordan was being manipulative in our friendship. I thought they were only reaching out when they needed something, and I felt used.',
    evolution_notes: [
      '2024-01-10: After reflecting, I realized I was projecting my own insecurities. Jordan has always been supportive, and I was misinterpreting their communication style.'
    ],
    created_in_high_emotion: true,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-4',
    user_id: 'mock-user',
    subject_alias: 'Morgan Lee',
    subject_person_id: null,
    content: 'I saw on Instagram that Morgan was at an event I wasn\'t invited to. I assumed they were intentionally excluding me from their social circle.',
    source: 'social_media',
    source_detail: 'Instagram post',
    confidence_level: 0.2,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I felt hurt and left out. I started overthinking our friendship and wondering if I had done something wrong. I didn\'t reach out to ask about it because I felt embarrassed.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I saw on Instagram that Morgan was at an event I wasn\'t invited to. I assumed they were intentionally excluding me from their social circle.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-5',
    user_id: 'mock-user',
    subject_alias: 'Riley Kim',
    subject_person_id: null,
    content: 'I overheard Riley talking about me in the break room. They were saying something about my work performance, but I only caught fragments of the conversation.',
    source: 'overheard',
    source_detail: 'Break room conversation',
    confidence_level: 0.5,
    sentiment: 'neutral',
    timestamp_heard: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I became self-conscious about my work and started second-guessing myself. I avoided Riley for a few days and felt anxious in their presence.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I overheard Riley talking about me in the break room. They were saying something about my work performance, but I only caught fragments of the conversation.',
    evolution_notes: [],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-6',
    user_id: 'mock-user',
    subject_alias: 'Casey Johnson',
    subject_person_id: null,
    content: 'I believed that Casey was being dishonest about their reasons for canceling our plans. I thought they were making excuses because they didn\'t want to spend time with me.',
    source: 'assumption',
    source_detail: 'Based on pattern of cancellations',
    confidence_level: 0.4,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I stopped making plans with Casey and felt rejected. I started questioning whether they actually valued our friendship. This made me more cautious about making plans with other people too.',
    status: 'retracted',
    retracted: true,
    resolution_note: 'I was wrong - Casey had legitimate family emergencies. I was being overly sensitive and projecting my own fears of rejection.',
    original_content: 'I believed that Casey was being dishonest about their reasons for canceling our plans. I thought they were making excuses because they didn\'t want to spend time with me.',
    evolution_notes: [
      '2024-01-20: I was wrong - Casey had legitimate family emergencies. I was being overly sensitive and projecting my own fears of rejection.'
    ],
    created_in_high_emotion: true,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-7',
    user_id: 'mock-user',
    subject_alias: 'Taylor Brown',
    subject_person_id: null,
    content: 'People said that Taylor was talking behind my back at work, saying I wasn\'t pulling my weight on the team project.',
    source: 'told_by',
    source_detail: 'Colleague mentioned it',
    confidence_level: 0.3,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I became defensive and started overworking to prove myself. I avoided Taylor and felt resentful. This created tension in our working relationship.',
    status: 'unverified',
    retracted: false,
    resolution_note: 'Taylor did express frustration, but it was about project timeline, not my work quality. I misunderstood the context.',
    original_content: 'People said that Taylor was talking behind my back at work, saying I wasn\'t pulling my weight on the team project.',
    evolution_notes: [
      '2024-01-18: Taylor did express frustration, but it was about project timeline, not my work quality. I misunderstood the context.'
    ],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-8',
    user_id: 'mock-user',
    subject_alias: 'Sam Williams',
    subject_person_id: null,
    content: 'I thought Sam was avoiding me because I saw them cross the street when they noticed me coming. I assumed they didn\'t want to talk to me.',
    source: 'assumption',
    source_detail: 'Observed behavior',
    confidence_level: 0.2,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I felt hurt and confused. I started wondering what I might have done wrong. I didn\'t reach out because I assumed they didn\'t want to talk to me.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I thought Sam was avoiding me because I saw them cross the street when they noticed me coming. I assumed they didn\'t want to talk to me.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];

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
