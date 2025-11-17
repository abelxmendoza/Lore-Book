import { useState, useEffect, useMemo, useRef } from 'react';
import { User, Calendar, BookOpen, Users, Tag, TrendingUp, Sparkles, Clock, FileText, Heart, MapPin, Award, BarChart3, AlertCircle, Bug, Activity, Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';
import { IdentityPulseModal } from '../identity/IdentityPulseModal';
import { InsightsModal } from '../InsightsModal';

const DEBUG = true; // Set to false in production

const debugLog = (component: string, message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[UserProfile:${component}]`, message, data || '');
  }
};

const debugError = (component: string, message: string, error: any) => {
  console.error(`[UserProfile:${component}] ERROR:`, message, error);
  if (DEBUG) {
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      response: error?.response,
      status: error?.status
    });
  }
};

type UserStats = {
  totalEntries: number;
  totalCharacters: number;
  totalChapters: number;
  totalTags: number;
  timelineSpan: { start: string; end: string; days: number };
  mostActivePeriod: { month: string; count: number };
  topTags: Array<{ tag: string; count: number }>;
  memoirProgress: { sections: number; lastUpdated: string | null };
  writingStreak: number;
  averageEntriesPerWeek: number;
  characterRelationships: number;
  mostMentionedCharacters: Array<{ name: string; mentions: number }>;
  entryFrequency: { thisWeek: number; lastWeek: number; trend: 'up' | 'down' | 'stable' };
};

export const UserProfile = () => {
  const { entries = [], chapters = [], tags = [], timeline } = useLoreKeeper();
  const [characters, setCharacters] = useState<any[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [languageStyle, setLanguageStyle] = useState<string | null>(null);
  const [charactersLoaded, setCharactersLoaded] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [identityPulseModalOpen, setIdentityPulseModalOpen] = useState(false);
  const [insightsModalOpen, setInsightsModalOpen] = useState(false);

  useEffect(() => {
    debugLog('useEffect', 'Component mounted, loading initial data');
    loadCharacters();
    loadLanguageStyle();
    loadInsights();
  }, []);

  const loadInsights = async () => {
    debugLog('loadInsights', 'Starting to load insights');
    setInsightsLoading(true);
    setErrors(prev => ({ ...prev, insights: '' }));
    try {
      const result = await fetchJson<{ insights?: any }>('/api/insights/recent');
      debugLog('loadInsights', 'Insights loaded successfully', { hasInsights: !!result.insights });
      setInsights(result.insights || result);
    } catch (error: any) {
      debugError('loadInsights', 'Failed to load insights', error);
      // Insights are optional, so don't fail if they're not available
      setInsights(null);
      setErrors(prev => ({ 
        ...prev, 
        insights: error?.message || 'Failed to load insights (optional)' 
      }));
    } finally {
      setInsightsLoading(false);
    }
  };

  // Use refs to track previous values and prevent unnecessary reloads
  const prevDataRef = useRef<{ entriesLength: number; charactersLength: number; chaptersLength: number; tagsLength: number } | null>(null);
  
  useEffect(() => {
    // Only load stats once characters are loaded
    if (!charactersLoaded) return;
    
    // Check if data has actually changed
    const currentData = {
      entriesLength: entries?.length || 0,
      charactersLength: characters?.length || 0,
      chaptersLength: chapters?.length || 0,
      tagsLength: tags?.length || 0
    };
    
    const prevData = prevDataRef.current;
    if (prevData && 
        prevData.entriesLength === currentData.entriesLength &&
        prevData.charactersLength === currentData.charactersLength &&
        prevData.chaptersLength === currentData.chaptersLength &&
        prevData.tagsLength === currentData.tagsLength) {
      // Data hasn't changed, skip reload
      return;
    }
    
    prevDataRef.current = currentData;
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charactersLoaded, entries?.length, characters?.length, chapters?.length, tags?.length]);

  const loadCharacters = async () => {
    debugLog('loadCharacters', 'Starting to load characters');
    setErrors(prev => ({ ...prev, characters: '' }));
    try {
      const response = await fetchJson<{ characters: any[] }>('/api/characters/list');
      const characterList = response.characters || [];
      debugLog('loadCharacters', 'Characters loaded successfully', { count: characterList.length });
      setCharacters(characterList);
      setCharactersLoaded(true);
    } catch (error: any) {
      debugError('loadCharacters', 'Failed to load characters', error);
      setCharactersLoaded(true); // Still mark as loaded even on error to prevent infinite loading
      setErrors(prev => ({ 
        ...prev, 
        characters: error?.message || 'Failed to load characters' 
      }));
    }
  };

  const loadLanguageStyle = async () => {
    debugLog('loadLanguageStyle', 'Starting to load language style');
    setErrors(prev => ({ ...prev, languageStyle: '' }));
    try {
      const result = await fetchJson<{ languageStyle: string | null }>('/api/documents/language-style');
      debugLog('loadLanguageStyle', 'Language style loaded', { hasStyle: !!result.languageStyle });
      setLanguageStyle(result.languageStyle);
    } catch (error: any) {
      debugError('loadLanguageStyle', 'Failed to load language style', error);
      setErrors(prev => ({ 
        ...prev, 
        languageStyle: error?.message || 'Failed to load language style (optional)' 
      }));
    }
  };

  const loadStats = async () => {
    debugLog('loadStats', 'Starting to calculate stats', {
      entriesCount: entries?.length || 0,
      charactersCount: characters?.length || 0,
      chaptersCount: chapters?.length || 0,
      tagsCount: tags?.length || 0
    });
    setLoading(true);
    setErrors(prev => ({ ...prev, stats: '' }));
    try {
      // Ensure we have arrays (handle undefined)
      const safeEntries = entries || [];
      const safeCharacters = characters || [];
      const safeChapters = chapters || [];
      const safeTags = tags || [];

      // Calculate timeline span
      const entryDates = safeEntries.map(e => new Date(e.date)).sort((a, b) => a.getTime() - b.getTime());
      const timelineSpan = entryDates.length > 0
        ? {
            start: entryDates[0].toISOString().split('T')[0],
            end: entryDates[entryDates.length - 1].toISOString().split('T')[0],
            days: Math.ceil((entryDates[entryDates.length - 1].getTime() - entryDates[0].getTime()) / (1000 * 60 * 60 * 24))
          }
        : { start: '', end: '', days: 0 };

      // Calculate most active period
      const monthCounts = new Map<string, number>();
      safeEntries.forEach(entry => {
        const month = new Date(entry.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
      });
      const mostActivePeriodEntry = Array.from(monthCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      const mostActivePeriod = mostActivePeriodEntry 
        ? { month: mostActivePeriodEntry[0], count: mostActivePeriodEntry[1] }
        : { month: 'N/A', count: 0 };

      // Calculate top tags
      const tagCounts = new Map<string, number>();
      safeEntries.forEach(entry => {
        entry.tags?.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });
      const topTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Calculate writing streak (consecutive days with entries)
      const uniqueDates = new Set(safeEntries.map(e => e.date.split('T')[0]));
      const sortedDates = Array.from(uniqueDates).sort().reverse();
      let streak = 0;
      const today = new Date().toISOString().split('T')[0];
      let currentDate = today;
      
      for (const date of sortedDates) {
        const dateObj = new Date(date);
        const expectedDate = new Date(currentDate);
        const diffDays = Math.floor((expectedDate.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0 || (streak === 0 && diffDays <= 1)) {
          streak++;
          currentDate = new Date(dateObj.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        } else {
          break;
        }
      }

      // Calculate average entries per week
      const weeks = timelineSpan.days > 0 ? Math.max(1, Math.ceil(timelineSpan.days / 7)) : 1;
      const averageEntriesPerWeek = safeEntries.length / weeks;

      // Get memoir progress (don't block on this - set it to default if it fails)
      let memoirProgress = { sections: 0, lastUpdated: null };
      try {
        // Add timeout to prevent hanging
        const memoirPromise = fetchJson<{ sections: any[]; updated_at?: string }>('/api/memoir/outline');
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
        const memoir = await Promise.race([memoirPromise, timeoutPromise]);
        
        if (memoir) {
          memoirProgress = {
            sections: memoir.sections?.length || 0,
            lastUpdated: memoir.updated_at || null
          };
        }
      } catch (error) {
        // Memoir might not exist yet - that's okay, use defaults
        console.debug('No memoir found yet');
      }

      // Calculate character relationships (approximate)
      const characterRelationships = safeCharacters.reduce((sum, char) => {
        const relationships = (char.metadata as any)?.relationships || [];
        return sum + relationships.length;
      }, 0);

      // Calculate most mentioned characters
      const characterMentions = new Map<string, number>();
      safeEntries.forEach(entry => {
        safeCharacters.forEach(char => {
          const content = (entry.content || '').toLowerCase();
          const name = char.name.toLowerCase();
          if (content.includes(name)) {
            characterMentions.set(char.name, (characterMentions.get(char.name) || 0) + 1);
          }
        });
      });
      const mostMentionedCharacters = Array.from(characterMentions.entries())
        .map(([name, mentions]) => ({ name, mentions }))
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 5);

      // Calculate entry frequency trend
      const now = new Date();
      const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const thisWeekEntries = safeEntries.filter(e => new Date(e.date) >= thisWeekStart).length;
      const lastWeekEntries = safeEntries.filter(e => {
        const date = new Date(e.date);
        return date >= lastWeekStart && date < thisWeekStart;
      }).length;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (thisWeekEntries > lastWeekEntries) trend = 'up';
      else if (thisWeekEntries < lastWeekEntries) trend = 'down';

      setStats({
        totalEntries: safeEntries.length,
        totalCharacters: safeCharacters.length,
        totalChapters: safeChapters.length,
        totalTags: safeTags.length,
        timelineSpan,
        mostActivePeriod,
        topTags,
        memoirProgress,
        writingStreak: streak,
        averageEntriesPerWeek: Math.round(averageEntriesPerWeek * 10) / 10,
        characterRelationships,
        mostMentionedCharacters,
        entryFrequency: { thisWeek: thisWeekEntries, lastWeek: lastWeekEntries, trend }
      });
      debugLog('loadStats', 'Stats calculated successfully');
    } catch (error: any) {
      debugError('loadStats', 'Failed to calculate stats', error);
      setErrors(prev => ({ 
        ...prev, 
        stats: error?.message || 'Failed to calculate stats' 
      }));
    } finally {
      setLoading(false);
    }
  };

  // Debug info display
  const hasErrors = Object.values(errors).some(e => e);
  
  if (loading || !stats) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <div className="space-y-4">
            {DEBUG && (
              <div className="flex items-center gap-2 text-xs text-yellow-300/80 mb-2">
                <Bug className="h-3 w-3" />
                <span>DEBUG: Loading stats...</span>
                <span className="text-yellow-300/60">·</span>
                <span>Characters loaded: {charactersLoaded ? 'Yes' : 'No'}</span>
                {hasErrors && (
                  <>
                    <span className="text-yellow-300/60">·</span>
                    <span className="text-red-400">Errors: {Object.keys(errors).filter(k => errors[k]).length}</span>
                  </>
                )}
              </div>
            )}
            {hasErrors && DEBUG && (
              <div className="bg-red-950/20 border border-red-500/30 rounded p-2 text-xs">
                {Object.entries(errors).filter(([_, msg]) => msg).map(([key, msg]) => (
                  <div key={key} className="text-red-400">
                    {key}: {msg}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Info */}
      {DEBUG && (
        <Card className="bg-yellow-950/20 border-yellow-500/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-yellow-300/80 flex-wrap">
              <Bug className="h-3 w-3" />
              <span>DEBUG MODE</span>
              <span className="text-yellow-300/60">·</span>
              <span>Stats loaded: {stats ? 'Yes' : 'No'}</span>
              <span className="text-yellow-300/60">·</span>
              <span>Entries: {entries?.length || 0}</span>
              <span className="text-yellow-300/60">·</span>
              <span>Characters: {characters?.length || 0}</span>
              <span className="text-yellow-300/60">·</span>
              <span>Chapters: {chapters?.length || 0}</span>
              {hasErrors && (
                <>
                  <span className="text-yellow-300/60">·</span>
                  <span className="text-red-400">Errors: {Object.keys(errors).filter(k => errors[k]).length}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {hasErrors && (
        <Card className="bg-red-950/20 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-400 mb-2">Some data failed to load</h3>
                <div className="space-y-1 text-xs text-white/80">
                  {Object.entries(errors).filter(([_, msg]) => msg).map(([key, msg]) => (
                    <div key={key}>
                      <span className="font-semibold">{key}:</span> {msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Main Profile Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-purple-900/20 border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/50">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-2xl">Your Profile</CardTitle>
              <p className="text-sm text-white/60 mt-1">Your lore-building journey</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-black/40 rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs">Entries</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalEntries}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs">Characters</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalCharacters}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <BookOpen className="h-4 w-4" />
                <span className="text-xs">Chapters</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalChapters}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-border/50">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <Tag className="h-4 w-4" />
                <span className="text-xs">Tags</span>
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalTags}</div>
            </div>
          </div>

          {/* Timeline Span */}
          {stats.timelineSpan.days > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-semibold">Timeline Span</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-white/50">Started</div>
                  <div className="text-sm text-white">{new Date(stats.timelineSpan.start).toLocaleDateString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-white/50">Days</div>
                  <div className="text-lg font-bold text-primary">{stats.timelineSpan.days}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/50">Latest</div>
                  <div className="text-sm text-white">{new Date(stats.timelineSpan.end).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Writing Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-semibold">Writing Streak</span>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.writingStreak}</div>
              <div className="text-xs text-white/50 mt-1">consecutive days</div>
            </div>
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <BarChart3 className="h-4 w-4" />
                <span className="text-sm font-semibold">Avg per Week</span>
              </div>
              <div className="text-2xl font-bold text-primary">{stats.averageEntriesPerWeek}</div>
              <div className="text-xs text-white/50 mt-1">entries</div>
            </div>
          </div>

          {/* Most Active Period */}
          {stats.mostActivePeriod.count > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold">Most Active Period</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white">{stats.mostActivePeriod.month}</span>
                <span className="text-primary font-bold">{stats.mostActivePeriod.count} entries</span>
              </div>
            </div>
          )}

          {/* Memoir Progress */}
          {stats.memoirProgress.sections > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <BookOpen className="h-4 w-4" />
                <span className="text-sm font-semibold">Memoir Progress</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white">{stats.memoirProgress.sections} sections</span>
                {stats.memoirProgress.lastUpdated && (
                  <span className="text-xs text-white/50">
                    Updated {new Date(stats.memoirProgress.lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Language Style */}
          {languageStyle && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-semibold">Writing Style</span>
              </div>
              <p className="text-sm text-white/80">{languageStyle}</p>
            </div>
          )}

          {/* Top Tags */}
          {stats.topTags.length > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-3">
                <Tag className="h-4 w-4" />
                <span className="text-sm font-semibold">Top Themes</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.topTags.map(({ tag, count }) => (
                  <div
                    key={tag}
                    className="px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-sm text-white"
                  >
                    {tag} <span className="text-primary/70">({count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Character Relationships */}
          {stats.characterRelationships > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-2">
                <Heart className="h-4 w-4" />
                <span className="text-sm font-semibold">Character Connections</span>
              </div>
              <div className="text-lg font-bold text-primary">{stats.characterRelationships}</div>
              <div className="text-xs text-white/50 mt-1">documented relationships</div>
            </div>
          )}

          {/* Most Mentioned Characters */}
          {stats.mostMentionedCharacters.length > 0 && (
            <div className="bg-black/40 rounded-lg p-4 border border-border/50">
              <div className="flex items-center gap-2 text-white/70 mb-3">
                <Users className="h-4 w-4" />
                <span className="text-sm font-semibold">Most Mentioned Characters</span>
              </div>
              <div className="space-y-2">
                {stats.mostMentionedCharacters.map(({ name, mentions }, idx) => (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50 w-4">{idx + 1}.</span>
                      <span className="text-sm text-white">{name}</span>
                    </div>
                    <span className="text-xs text-primary/70">{mentions} mentions</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entry Frequency Trend */}
          <div className="bg-black/40 rounded-lg p-4 border border-border/50">
            <div className="flex items-center gap-2 text-white/70 mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-semibold">This Week</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-white">{stats.entryFrequency.thisWeek}</div>
                <div className="text-xs text-white/50 mt-1">entries this week</div>
              </div>
              <div className="text-right">
                {stats.entryFrequency.trend === 'up' && (
                  <div className="flex items-center gap-1 text-green-400">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm">+{stats.entryFrequency.thisWeek - stats.entryFrequency.lastWeek}</span>
                  </div>
                )}
                {stats.entryFrequency.trend === 'down' && (
                  <div className="flex items-center gap-1 text-red-400">
                    <TrendingUp className="h-4 w-4 rotate-180" />
                    <span className="text-sm">{stats.entryFrequency.thisWeek - stats.entryFrequency.lastWeek}</span>
                  </div>
                )}
                {stats.entryFrequency.trend === 'stable' && (
                  <div className="text-xs text-white/50">Stable</div>
                )}
              </div>
            </div>
          </div>

          {/* Identity Pulse & Insights - Clickable Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <button
              onClick={() => setIdentityPulseModalOpen(true)}
              className="bg-gradient-to-br from-primary/10 to-purple-900/20 border border-primary/30 rounded-lg p-4 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 transition-all text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="Open Identity Pulse modal"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 group-hover:bg-primary/30 transition-colors">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-primary transition-colors">Identity Pulse</h3>
                  <p className="text-xs text-white/60">Active persona signature</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mt-2">View your identity metrics, emotional trajectory, and stability indicators</p>
              <div className="mt-3 text-xs text-primary/70 flex items-center gap-1">
                <span>Click to explore</span>
                <span>→</span>
              </div>
            </button>

            <button
              onClick={() => setInsightsModalOpen(true)}
              className="bg-gradient-to-br from-primary/10 to-purple-900/20 border border-primary/30 rounded-lg p-4 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 transition-all text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="Open AI-Assisted Patterns modal"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 group-hover:bg-primary/30 transition-colors">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white group-hover:text-primary transition-colors">AI-Assisted Patterns</h3>
                  <p className="text-xs text-white/60">Discover insights</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mt-2">Explore patterns, correlations, cycles, and predictions in your journal</p>
              <div className="mt-3 text-xs text-primary/70 flex items-center gap-1">
                <span>Click to explore</span>
                <span>→</span>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <IdentityPulseModal
        isOpen={identityPulseModalOpen}
        onClose={() => setIdentityPulseModalOpen(false)}
      />
      <InsightsModal
        isOpen={insightsModalOpen}
        onClose={() => setInsightsModalOpen(false)}
        insights={insights}
        loading={insightsLoading}
        onRefresh={loadInsights}
      />
    </div>
  );
};

