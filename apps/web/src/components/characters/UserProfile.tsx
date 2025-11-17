import { useState, useEffect, useMemo } from 'react';
import { User, Calendar, BookOpen, Users, Tag, TrendingUp, Sparkles, Clock, FileText, Heart, MapPin, Award, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';
import { IdentityPulsePanel } from '../identity/IdentityPulsePanel';
import { InsightsPanel } from '../InsightsPanel';

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

  useEffect(() => {
    loadCharacters();
    loadLanguageStyle();
    loadInsights();
  }, []);

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await fetchJson<{ insights?: any }>('/api/insights/recent');
      setInsights(result.insights || result);
    } catch (error) {
      console.error('Failed to load insights:', error);
      // Insights are optional, so don't fail if they're not available
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    // Only load stats once characters are loaded
    if (charactersLoaded) {
      loadStats();
    }
  }, [entries, characters, chapters, tags, charactersLoaded]);

  const loadCharacters = async () => {
    try {
      const response = await fetchJson<{ characters: any[] }>('/api/characters/list');
      setCharacters(response.characters || []);
      setCharactersLoaded(true);
    } catch (error) {
      console.error('Failed to load characters:', error);
      setCharactersLoaded(true); // Still mark as loaded even on error to prevent infinite loading
    }
  };

  const loadLanguageStyle = async () => {
    try {
      const result = await fetchJson<{ languageStyle: string | null }>('/api/documents/language-style');
      setLanguageStyle(result.languageStyle);
    } catch (error) {
      console.error('Failed to load language style:', error);
    }
  };

  const loadStats = async () => {
    setLoading(true);
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
        writingStreak,
        averageEntriesPerWeek: Math.round(averageEntriesPerWeek * 10) / 10,
        characterRelationships,
        mostMentionedCharacters,
        entryFrequency: { thisWeek: thisWeekEntries, lastWeek: lastWeekEntries, trend }
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
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
        </CardContent>
      </Card>

      {/* Identity Pulse & Insights */}
      <div className="grid gap-6 lg:grid-cols-2">
        <IdentityPulsePanel />
        <InsightsPanel insights={insights} loading={insightsLoading} onRefresh={loadInsights} />
      </div>
    </div>
  );
};

