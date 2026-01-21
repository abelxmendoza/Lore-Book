// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect } from 'react';
import { Trophy, Crown, TrendingUp, Heart, BarChart3, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { getMockRankings } from '../../mocks/romanticRelationships';
import { RelationshipCard } from './RelationshipCard';

type RankedRelationship = {
  id: string;
  person_id: string;
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  compatibility_score: number;
  relationship_health: number;
  emotional_intensity: number;
  rank_among_all?: number;
  rank_among_active?: number;
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
};

type RankingCategory = 'overall' | 'active' | 'compatibility' | 'intensity' | 'health';

export const RankingView = () => {
  const { useMockData: shouldUseMockData } = useMockData();
  const [relationships, setRelationships] = useState<RankedRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<RankingCategory>('overall');
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);

  useEffect(() => {
    loadRankings();
  }, [activeCategory, shouldUseMockData]);

  const loadRankings = async () => {
    setLoading(true);
    try {
      // Use mock data if enabled
      if (shouldUseMockData) {
        const mockRankings = getMockRankings(activeCategory);
        setRelationships(mockRankings as RankedRelationship[]);
        setLoading(false);
        return;
      }

      // Load real data from API
      const data = await fetchJson<{ success: boolean; relationships: RankedRelationship[] }>(
        `/api/conversation/romantic-relationships`
      );

      if (data.success) {
        let ranked = data.relationships;

        // Load person names and rankings
        const relationshipsWithNames = await Promise.all(
          ranked.map(async (rel) => {
            try {
              let personName = 'Unknown';
              if (rel.person_type === 'character') {
                const charData = await fetchJson<{ name: string }>(
                  `/api/characters/${rel.person_id}`
                ).catch(() => null);
                personName = charData?.name || 'Unknown';
              }
              
              // Load ranking from analytics
              const rankingData = await fetchJson<{
                rankAmongAll: number | null;
                rankAmongActive: number | null;
              }>(`/api/conversation/romantic-relationships/${rel.id}/ranking`).catch(() => null);
              
              return { 
                ...rel, 
                person_name: personName,
                rank_among_all: rankingData?.rankAmongAll || rel.rank_among_all,
                rank_among_active: rankingData?.rankAmongActive || rel.rank_among_active
              };
            } catch {
              return { ...rel, person_name: 'Unknown' };
            }
          })
        );

        // Sort by category
        switch (activeCategory) {
          case 'overall':
            relationshipsWithNames.sort((a, b) => (a.rank_among_all || 999) - (b.rank_among_all || 999));
            break;
          case 'active':
            relationshipsWithNames.sort((a, b) => (a.rank_among_active || 999) - (b.rank_among_active || 999));
            break;
          case 'compatibility':
            relationshipsWithNames.sort((a, b) => b.compatibility_score - a.compatibility_score);
            break;
          case 'intensity':
            relationshipsWithNames.sort((a, b) => b.emotional_intensity - a.emotional_intensity);
            break;
          case 'health':
            relationshipsWithNames.sort((a, b) => b.relationship_health - a.relationship_health);
            break;
        }

        setRelationships(relationshipsWithNames);
      }
    } catch (error) {
      console.error('Failed to load rankings:', error);
      // Fallback to mock data on error if mock data is enabled
      if (shouldUseMockData) {
        const mockRankings = getMockRankings(activeCategory);
        setRelationships(mockRankings as RankedRelationship[]);
      } else {
        setRelationships([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank: number | undefined, category: RankingCategory) => {
    if (!rank) return null;
    
    // Use consistent width for all badges to ensure alignment
    const baseClasses = "flex items-center justify-center min-w-[100px]";
    
    if (rank === 1) {
      return (
        <Badge variant="outline" className={`${baseClasses} bg-amber-500/20 text-amber-300 border-amber-500/30`}>
          <Crown className="w-3 h-3 mr-1" />
          <span>#{rank} - The One</span>
        </Badge>
      );
    }
    if (rank <= 3) {
      return (
        <Badge variant="outline" className={`${baseClasses} bg-purple-500/20 text-purple-300 border-purple-500/30`}>
          <Trophy className="w-3 h-3 mr-1" />
          <span>#{rank}</span>
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className={`${baseClasses} bg-white/10 text-white/70 border-white/20`}>
        <span>#{rank}</span>
      </Badge>
    );
  };

  const toggleComparison = (relationshipId: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(relationshipId)) {
        return prev.filter(id => id !== relationshipId);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), relationshipId];
      }
      return [...prev, relationshipId];
    });
  };

  if (loading) {
    return (
      <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-purple-950/20">
        <CardContent className="p-8">
          <div className="text-center text-white/60">
            <Trophy className="w-12 h-12 mx-auto mb-4 text-pink-400/50 animate-pulse" />
            <p>Calculating rankings...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-purple-950/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-3 text-2xl text-white">
                <Trophy className="w-7 h-7 text-pink-400" />
                Your Love Rankings
              </CardTitle>
              <p className="text-white/70 text-sm mt-2">
                See how your relationships rank across different metrics. Rankings are automatically calculated based on compatibility, health, and more.
                {shouldUseMockData && (
                  <span className="ml-2 text-xs text-yellow-400/80">(Mock Data)</span>
                )}
              </p>
            </div>
            {shouldUseMockData && (
              <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                <span className="text-xs">Demo</span>
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as RankingCategory)}>
        <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto">
          <TabsTrigger value="overall" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Overall</span>
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span>Active</span>
          </TabsTrigger>
          <TabsTrigger value="compatibility" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span>Compatibility</span>
          </TabsTrigger>
          <TabsTrigger value="intensity" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Intensity</span>
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span>Health</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6">
          {relationships.length === 0 ? (
            <Card className="border-border/60 bg-black/40">
              <CardContent className="p-12 text-center">
                <Trophy className="w-16 h-16 mx-auto mb-4 text-pink-400/30" />
                <h3 className="text-lg font-semibold text-white mb-2">No relationships to rank</h3>
                <p className="text-white/60 text-sm">
                  Start chatting about your relationships and they'll be automatically ranked!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {relationships.map((rel, index) => {
                const displayRank = activeCategory === 'overall' 
                  ? rel.rank_among_all 
                  : activeCategory === 'active'
                  ? rel.rank_among_active
                  : index + 1;

                return (
                  <Card
                    key={rel.id}
                    className={`border-border/60 bg-gradient-to-br from-black/40 to-black/60 transition-all ${
                      selectedForComparison.includes(rel.id)
                        ? 'border-pink-500/50 bg-pink-950/20'
                        : 'hover:border-pink-500/30'
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4 flex-1">
                          {/* Rank Badge */}
                          <div className="flex-shrink-0 flex items-center">
                            {getRankBadge(displayRank, activeCategory)}
                          </div>

                          {/* Relationship Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-white text-lg">
                                {rel.person_name || rel.relationship_type}
                              </h3>
                              {displayRank === 1 && activeCategory === 'overall' && (
                                <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                                  <Crown className="w-3 h-3 mr-1" />
                                  Top Match
                                </Badge>
                              )}
                            </div>

                            {/* Scores */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                              <div>
                                <p className="text-xs text-white/50 mb-1">Compatibility</p>
                                <p className="text-sm font-semibold text-white">
                                  {Math.round(rel.compatibility_score * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Health</p>
                                <p className="text-sm font-semibold text-white">
                                  {Math.round(rel.relationship_health * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Affection</p>
                                <p className="text-sm font-semibold text-white">
                                  {Math.round(rel.affection_score * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Intensity</p>
                                <p className="text-sm font-semibold text-white">
                                  {Math.round(rel.emotional_intensity * 100)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Comparison Toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleComparison(rel.id)}
                          className={selectedForComparison.includes(rel.id) ? 'bg-pink-500/20 border-pink-500/50' : ''}
                        >
                          {selectedForComparison.includes(rel.id) ? 'Selected' : 'Compare'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Comparison Mode */}
      {selectedForComparison.length >= 2 && (
        <Card className="border-primary/30 bg-primary/10">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Comparison Mode ({selectedForComparison.length} selected)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white/80 text-sm mb-4">
              Compare these relationships side-by-side. Switch to the Chat tab in any relationship to ask "What made X different?" or "Why is Y ranked higher?"
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedForComparison([])}
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
