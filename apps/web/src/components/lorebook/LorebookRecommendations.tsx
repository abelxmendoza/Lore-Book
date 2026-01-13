/**
 * Lorebook Recommendations Component
 * 
 * Displays intelligent recommendations based on user's data:
 * - Full Life Story
 * - Character-based lorebooks
 * - Location-based lorebooks
 * - Event-based lorebooks
 * - Skill-based lorebooks
 * - Timeline-based lorebooks
 */

import { useState, useEffect } from 'react';
import { BookOpen, User, MapPin, Calendar, Award, Clock, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import type { BiographySpec } from '../../../server/src/services/biographyGeneration/types';

interface LorebookRecommendation {
  id: string;
  title: string;
  description: string;
  type: 'full_life' | 'character' | 'location' | 'event' | 'skill' | 'timeline' | 'domain';
  spec: BiographySpec & {
    characterIds?: string[];
    locationIds?: string[];
    eventIds?: string[];
    skillIds?: string[];
  };
  reason: string;
  priority: number;
  estimatedChapters: number;
  metadata?: {
    characterName?: string;
    locationName?: string;
    eventTitle?: string;
    skillName?: string;
    timeRange?: { start: string; end: string };
  };
}

interface LorebookRecommendationsProps {
  onGenerate: (spec: BiographySpec & { characterIds?: string[]; locationIds?: string[]; eventIds?: string[]; skillIds?: string[] }, type?: string) => void;
}

export const LorebookRecommendations = ({ onGenerate }: LorebookRecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<LorebookRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const result = await fetchJson<{ recommendations: LorebookRecommendation[] }>('/api/biography/lorebook-recommendations?limit=15');
      setRecommendations(result.recommendations || []);
    } catch (error) {
      console.error('Failed to load lorebook recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = (recommendation: LorebookRecommendation) => {
    onGenerate(recommendation.spec, recommendation.type);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'full_life':
        return <BookOpen className="h-5 w-5" />;
      case 'character':
        return <User className="h-5 w-5" />;
      case 'location':
        return <MapPin className="h-5 w-5" />;
      case 'event':
        return <Calendar className="h-5 w-5" />;
      case 'skill':
        return <Award className="h-5 w-5" />;
      case 'timeline':
        return <Clock className="h-5 w-5" />;
      case 'domain':
        return <Sparkles className="h-5 w-5" />;
      default:
        return <BookOpen className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'full_life':
        return 'from-purple-900/30 to-pink-900/30 border-purple-500/30';
      case 'character':
        return 'from-blue-900/30 to-cyan-900/30 border-blue-500/30';
      case 'location':
        return 'from-green-900/30 to-emerald-900/30 border-green-500/30';
      case 'event':
        return 'from-orange-900/30 to-amber-900/30 border-orange-500/30';
      case 'skill':
        return 'from-red-900/30 to-rose-900/30 border-red-500/30';
      case 'timeline':
        return 'from-indigo-900/30 to-violet-900/30 border-indigo-500/30';
      case 'domain':
        return 'from-yellow-900/30 to-amber-900/30 border-yellow-500/30';
      default:
        return 'from-gray-900/30 to-slate-900/30 border-gray-500/30';
    }
  };

  const groupByType = (recs: LorebookRecommendation[]) => {
    const groups: Record<string, LorebookRecommendation[]> = {};
    for (const rec of recs) {
      if (!groups[rec.type]) {
        groups[rec.type] = [];
      }
      groups[rec.type].push(rec);
    }
    return groups;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="text-center p-8 text-white/60">
        <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/40" />
        <p>No recommendations available yet.</p>
        <p className="text-sm mt-2">Start chatting to build your knowledge base!</p>
      </div>
    );
  }

  const grouped = groupByType(recommendations);
  const typeOrder = ['full_life', 'character', 'location', 'event', 'skill', 'timeline', 'domain'];

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Recommended Lorebooks</h2>
        <p className="text-white/60 text-sm">
          Based on your memories, relationships, locations, events, and skills
        </p>
      </div>

      {typeOrder.map((type) => {
        const typeRecs = grouped[type] || [];
        if (typeRecs.length === 0) return null;

        const isExpanded = expandedType === type;
        const typeLabel = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

        return (
          <div key={type} className="space-y-3">
            <button
              onClick={() => setExpandedType(isExpanded ? null : type)}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-border/50 bg-black/40 hover:bg-black/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${getTypeColor(type)}`}>
                  {getTypeIcon(type)}
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white">{typeLabel}</div>
                  <div className="text-xs text-white/60">{typeRecs.length} recommendation{typeRecs.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <ChevronRight className={`h-5 w-5 text-white/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>

            {isExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-12">
                {typeRecs.map((rec) => (
                  <Card
                    key={rec.id}
                    className={`bg-gradient-to-br ${getTypeColor(type)} hover:scale-[1.02] transition-transform cursor-pointer`}
                    onClick={() => handleGenerate(rec)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                          {getTypeIcon(rec.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg text-white mb-1 line-clamp-2">
                            {rec.title}
                          </CardTitle>
                          <CardDescription className="text-white/70 text-xs line-clamp-2">
                            {rec.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-white/60 line-clamp-2">{rec.reason}</p>
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>~{rec.estimatedChapters} chapters</span>
                        {rec.metadata && (
                          <span className="text-primary/70">
                            {rec.metadata.characterName || rec.metadata.locationName || rec.metadata.eventTitle || rec.metadata.skillName || ''}
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerate(rec);
                        }}
                        size="sm"
                        className="w-full bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
                        leftIcon={<Sparkles className="h-3 w-3" />}
                      >
                        Generate
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
