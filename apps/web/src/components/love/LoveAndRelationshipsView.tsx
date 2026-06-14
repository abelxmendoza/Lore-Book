// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect } from 'react';
import { Heart, Search, Filter, TrendingUp, Users, Sparkles, Ban, RotateCcw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { isIndividualPersonName } from '../../lib/personNameValidation';
import { 
  getMockRomanticRelationships, 
  getMockRomanticRelationshipsByFilter,
  type MockRomanticRelationship 
} from '../../mocks/romanticRelationships';
import { getMockCharacterSuggestionBookNames } from '../../mocks/characterSuggestions';
import { RelationshipCard } from './RelationshipCard';
import { RelationshipDetailModal } from './RelationshipDetailModal';
import { RankingView } from './RankingView';
import { DetectedCharacterSuggestions } from '../characters/DetectedCharacterSuggestions';

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

type CharacterListItem = {
  name: string;
  alias?: string[] | null;
};

type FilterType =
  | 'all'
  | 'active'
  | 'past'
  | 'no_contact'
  | 'reconnection'
  | 'situationships'
  | 'dating'
  | 'crushes'
  | 'high_risk'
  | 'rankings';

const END_STATE_STATUSES = new Set(['ended', 'ghosted', 'blocked']);
const NO_CONTACT_STATUSES = new Set(['ghosted', 'blocked']);
const RECONNECTION_STATUSES = new Set(['rekindled']);
const CRUSH_TYPES = new Set(['crush', 'obsession', 'infatuation', 'lust']);
const DATING_TYPES = new Set(['dating', 'boyfriend', 'girlfriend', 'lover', 'in_love', 'fiancé', 'fiancée', 'wife', 'husband']);

const relationshipStatus = (relationship: RomanticRelationship) => relationship.status.toLowerCase();
const relationshipType = (relationship: RomanticRelationship) => relationship.relationship_type.toLowerCase();
const isEndedRelationship = (relationship: RomanticRelationship) =>
  !relationship.is_current || END_STATE_STATUSES.has(relationshipStatus(relationship)) || relationshipType(relationship).startsWith('ex_');
const isActiveRelationship = (relationship: RomanticRelationship) =>
  relationship.is_current && !isEndedRelationship(relationship);
const isCrushRelationship = (relationship: RomanticRelationship) =>
  CRUSH_TYPES.has(relationshipType(relationship));
const isDatingRelationship = (relationship: RomanticRelationship) =>
  DATING_TYPES.has(relationshipType(relationship)) && isActiveRelationship(relationship);
const isNoContactRelationship = (relationship: RomanticRelationship) =>
  NO_CONTACT_STATUSES.has(relationshipStatus(relationship));
const hasReconnectionPotential = (relationship: RomanticRelationship) =>
  RECONNECTION_STATUSES.has(relationshipStatus(relationship)) ||
  relationship.green_flags.length > relationship.red_flags.length + 1 ||
  (relationship.compatibility_score >= 0.7 && relationship.relationship_health >= 0.45 && !isNoContactRelationship(relationship));
const isHighRiskRelationship = (relationship: RomanticRelationship) =>
  relationship.red_flags.length >= 2 ||
  relationship.relationship_health < 0.35 ||
  ['blocked', 'ghosted', 'obsession', 'complicated'].includes(relationshipStatus(relationship)) ||
  relationshipType(relationship) === 'obsession';

export const LoveAndRelationshipsView = () => {
  const { useMockData: shouldUseMockData } = useMockData();
  const [relationships, setRelationships] = useState<RomanticRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null);
  const [existingCharacterNames, setExistingCharacterNames] = useState<string[]>([]);

  useEffect(() => {
    loadRelationships();
  }, [activeFilter, shouldUseMockData]);

  useEffect(() => {
    void loadCharacterNames();
  }, [shouldUseMockData]);

  const loadCharacterNames = async () => {
    if (shouldUseMockData) {
      setExistingCharacterNames(getMockCharacterSuggestionBookNames('romantic'));
      return;
    }

    try {
      const response = await fetchJson<{ characters: CharacterListItem[] }>('/api/characters/list');
      setExistingCharacterNames(
        (response.characters || []).flatMap(character => [
          character.name,
          ...(Array.isArray(character.alias) ? character.alias : []),
        ])
      );
    } catch {
      setExistingCharacterNames([]);
    }
  };

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

      const data = await fetchJson<{ success: boolean; relationships: RomanticRelationship[] }>(
        '/api/conversation/romantic-relationships'
      );

      if (data.success) {
        const withNames = data.relationships.filter(
          (rel) => isIndividualPersonName(rel.person_name)
        );
        setRelationships(withNames);
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

  const activeRelationships = filteredRelationships.filter(isActiveRelationship);
  const pastRelationships = filteredRelationships.filter(isEndedRelationship);
  const noContactRelationships = filteredRelationships.filter(isNoContactRelationship);
  const reconnectionRelationships = filteredRelationships.filter(r => isEndedRelationship(r) && hasReconnectionPotential(r));
  const situationships = filteredRelationships.filter(r => r.is_situationship);
  const datingRelationships = filteredRelationships.filter(isDatingRelationship);
  const crushes = filteredRelationships.filter(isCrushRelationship);
  const highRiskRelationships = filteredRelationships.filter(isHighRiskRelationship);
  const visibleRelationships = (() => {
    switch (activeFilter) {
      case 'active':
        return activeRelationships;
      case 'past':
        return pastRelationships;
      case 'no_contact':
        return noContactRelationships;
      case 'reconnection':
        return reconnectionRelationships;
      case 'situationships':
        return situationships;
      case 'dating':
        return datingRelationships;
      case 'crushes':
        return crushes;
      case 'high_risk':
        return highRiskRelationships;
      case 'rankings':
        return [];
      default:
        return filteredRelationships;
    }
  })();

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
                {pastRelationships.length > 0 && ` · ${pastRelationships.length} past`}
                {noContactRelationships.length > 0 && ` · ${noContactRelationships.length} no contact`}
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

      <DetectedCharacterSuggestions
        variant="romantic"
        demoMode={shouldUseMockData}
        existingCharacterNames={
          shouldUseMockData
            ? getMockCharacterSuggestionBookNames('romantic')
            : [
                ...existingCharacterNames,
                ...relationships.flatMap(rel => rel.person_name ? [rel.person_name] : []),
              ]
        }
        onCharacterAdded={() => {
          void loadCharacterNames();
          void loadRelationships();
        }}
      />

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
            value="no_contact"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[90px] sm:min-w-0"
          >
            <Ban className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">No Contact</span>
            <span className="sm:hidden">No Contact</span>
          </TabsTrigger>
          <TabsTrigger 
            value="reconnection"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[95px] sm:min-w-0"
          >
            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Reconnection</span>
            <span className="sm:hidden">Reconnect</span>
          </TabsTrigger>
          <TabsTrigger 
            value="situationships"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[100px] sm:min-w-0"
          >
            <span className="hidden sm:inline">Situationships</span>
            <span className="sm:hidden">Situations</span>
          </TabsTrigger>
          <TabsTrigger 
            value="dating"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Dating</span>
          </TabsTrigger>
          <TabsTrigger 
            value="crushes"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Crushes</span>
          </TabsTrigger>
          <TabsTrigger 
            value="high_risk"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[80px] sm:min-w-0"
          >
            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">High Risk</span>
            <span className="sm:hidden">Risk</span>
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
          {(activeFilter === 'all' || activeFilter === 'active') && activeRelationships.length > 0 && (
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
              {situationships.map((rel) => (
                <RelationshipCard
                  key={rel.id}
                  relationship={rel}
                  onClick={() => setSelectedRelationship(rel.id)}
                />
              ))}
            </div>
          )}

          {/* Dating Section */}
          {activeFilter === 'dating' && datingRelationships.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {datingRelationships.map((rel) => (
                <RelationshipCard
                  key={rel.id}
                  relationship={rel}
                  onClick={() => setSelectedRelationship(rel.id)}
                />
              ))}
            </div>
          )}

          {/* No Contact Section */}
          {activeFilter === 'no_contact' && noContactRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-400" />
                No Contact
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {noContactRelationships.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reconnection Section */}
          {activeFilter === 'reconnection' && reconnectionRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-blue-400" />
                Possible Reconnection
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reconnectionRelationships.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* High Risk Section */}
          {activeFilter === 'high_risk' && highRiskRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                High Risk / Needs Care
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {highRiskRelationships.map((rel) => (
                  <RelationshipCard
                    key={rel.id}
                    relationship={rel}
                    onClick={() => setSelectedRelationship(rel.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rankings Section */}
          {activeFilter === 'rankings' && (
            <RankingView />
          )}

          {/* Empty State */}
          {activeFilter !== 'rankings' && visibleRelationships.length === 0 && (
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
