// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect } from 'react';
import { Heart, Search, Filter, TrendingUp, Users, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { 
  getMockRomanticRelationships, 
  getMockRomanticRelationshipsByFilter,
  type MockRomanticRelationship 
} from '../../mocks/romanticRelationships';
import { RelationshipCard } from './RelationshipCard';
import { RelationshipDetailModal } from './RelationshipDetailModal';
import { RankingView } from './RankingView';

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
};

type FilterType = 'all' | 'active' | 'past' | 'situationships' | 'crushes' | 'rankings';

export const LoveAndRelationshipsView = () => {
  const { useMockData: shouldUseMockData } = useMockData();
  const [relationships, setRelationships] = useState<RomanticRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null);

  useEffect(() => {
    loadRelationships();
  }, [activeFilter, shouldUseMockData]);

  const loadRelationships = async () => {
    setLoading(true);
    try {
      // Use mock data if enabled
      if (shouldUseMockData) {
        const mockRelationships = getMockRomanticRelationshipsByFilter(
          activeFilter === 'rankings' ? 'all' : activeFilter
        );
        setRelationships(mockRelationships as RomanticRelationship[]);
        setLoading(false);
        return;
      }

      // Load real data from API
      const params = new URLSearchParams();
      if (activeFilter === 'active') {
        params.append('status', 'active');
        params.append('isCurrent', 'true');
      } else if (activeFilter === 'past') {
        params.append('status', 'ended');
      }

      const data = await fetchJson<{ success: boolean; relationships: RomanticRelationship[] }>(
        `/api/conversation/romantic-relationships?${params.toString()}`
      );

      if (data.success) {
        let filtered = data.relationships;
        
        // Filter by type
        if (activeFilter === 'situationships') {
          filtered = filtered.filter(r => r.is_situationship);
        } else if (activeFilter === 'crushes') {
          filtered = filtered.filter(r => 
            r.relationship_type === 'crush' || 
            r.relationship_type === 'obsession' || 
            r.relationship_type === 'infatuation'
          );
        }

        // Load person names for each relationship
        const relationshipsWithNames = await Promise.all(
          filtered.map(async (rel) => {
            try {
              if (rel.person_type === 'character') {
                const charData = await fetchJson<{ name: string }>(
                  `/api/characters/${rel.person_id}`
                ).catch(() => null);
                return { ...rel, person_name: charData?.name || 'Unknown' };
              } else {
                // For omega_entity, we'd need to fetch from entities table
                return { ...rel, person_name: 'Unknown' };
              }
            } catch {
              return { ...rel, person_name: 'Unknown' };
            }
          })
        );

        setRelationships(relationshipsWithNames);
      }
    } catch (error) {
      console.error('Failed to load relationships:', error);
      // Fallback to mock data on error if mock data is enabled
      if (shouldUseMockData) {
        const mockRelationships = getMockRomanticRelationshipsByFilter(
          activeFilter === 'rankings' ? 'all' : activeFilter
        );
        setRelationships(mockRelationships as RomanticRelationship[]);
      } else {
        setRelationships([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredRelationships = relationships.filter(rel => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      rel.person_name?.toLowerCase().includes(term) ||
      rel.relationship_type.toLowerCase().includes(term) ||
      rel.status.toLowerCase().includes(term)
    );
  });

  const activeRelationships = filteredRelationships.filter(r => r.is_current && r.status === 'active');
  const pastRelationships = filteredRelationships.filter(r => !r.is_current || r.status === 'ended');
  const crushes = filteredRelationships.filter(r => 
    r.relationship_type === 'crush' || 
    r.relationship_type === 'obsession' || 
    r.relationship_type === 'infatuation'
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-purple-950/20">
          <CardContent className="p-8">
            <div className="text-center text-white/60">
              <Heart className="w-12 h-12 mx-auto mb-4 text-pink-400/50 animate-pulse" />
              <p>Loading your love story...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 via-purple-950/20 to-pink-950/20">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div>
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl text-white mb-2">
                <Heart className="w-5 h-5 sm:w-7 sm:h-7 text-pink-400" />
                Your Love Story
              </CardTitle>
              <p className="text-white/70 text-xs sm:text-sm">
                {relationships.length} relationship{relationships.length !== 1 ? 's' : ''} tracked
                {activeRelationships.length > 0 && ` · ${activeRelationships.length} active`}
                {crushes.length > 0 && ` · ${crushes.length} crush${crushes.length !== 1 ? 'es' : ''}`}
                {shouldUseMockData && (
                  <span className="ml-2 text-[10px] sm:text-xs text-yellow-400/80">(Mock Data)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {shouldUseMockData && (
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[10px] sm:text-xs">
                  <span>Demo</span>
                </Badge>
              )}
              <Badge variant="outline" className="bg-pink-500/20 text-pink-300 border-pink-500/30 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Powered
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search relationships..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
        <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="all" 
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[60px] sm:min-w-0"
          >
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>All</span>
          </TabsTrigger>
          <TabsTrigger 
            value="active"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Active</span>
          </TabsTrigger>
          <TabsTrigger 
            value="past"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-gray-500/20 data-[state=active]:text-gray-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[60px] sm:min-w-0"
          >
            <span>Past</span>
          </TabsTrigger>
          <TabsTrigger 
            value="situationships"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[100px] sm:min-w-0"
          >
            <span className="hidden sm:inline">Situationships</span>
            <span className="sm:hidden">Situations</span>
          </TabsTrigger>
          <TabsTrigger 
            value="crushes"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Crushes</span>
          </TabsTrigger>
          <TabsTrigger 
            value="rankings"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[80px] sm:min-w-0"
          >
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Rankings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeFilter} className="mt-6">
          {/* Active Relationships Section */}
          {activeFilter === 'all' && activeRelationships.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-400" />
                Active Relationships
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeRelationships.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Crushes Section */}
          {(activeFilter === 'all' || activeFilter === 'crushes') && crushes.length > 0 && (
            <div className={activeFilter === 'all' ? 'mb-8' : ''}>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-400" />
                Crushes & Interests
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {crushes.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past Relationships Section */}
          {(activeFilter === 'all' || activeFilter === 'past') && pastRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-white/60">Past Relationships</span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pastRelationships.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Situationships Section */}
          {activeFilter === 'situationships' && filteredRelationships.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRelationships.map((rel) => (
                <RelationshipCard
                  key={rel.id}
                  relationship={rel}
                  onClick={() => setSelectedRelationship(rel.id)}
                />
              ))}
            </div>
          )}

          {/* Rankings Section */}
          {activeFilter === 'rankings' && (
            <RankingView />
          )}

          {/* Empty State */}
          {activeFilter !== 'rankings' && filteredRelationships.length === 0 && (
            <Card className="border-border/60 bg-black/40">
              <CardContent className="p-12 text-center">
                <Heart className="w-16 h-16 mx-auto mb-4 text-pink-400/30" />
                <h3 className="text-lg font-semibold text-white mb-2">No relationships found</h3>
                <p className="text-white/60 text-sm mb-4">
                  {searchTerm 
                    ? 'Try a different search term'
                    : 'Relationships are automatically detected from your conversations! Start chatting about someone you like.'}
                </p>
                {!searchTerm && (
                  <p className="text-white/40 text-xs">
                    Just mention them in chat and we'll track your relationship automatically
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Relationship Detail Modal */}
      {selectedRelationship && (
        <RelationshipDetailModal
          relationshipId={selectedRelationship}
          onClose={() => setSelectedRelationship(null)}
          onUpdate={() => {
            loadRelationships();
            setSelectedRelationship(null);
          }}
        />
      )}
    </div>
  );
};
