// =====================================================
// ROMANTIC RELATIONSHIPS VIEW
// Purpose: Display all romantic relationships with analytics
// =====================================================

import { useState, useEffect } from 'react';
import { Heart, AlertTriangle, CheckCircle, Link2, UserRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { RomanticRelationshipDetailModal } from './RomanticRelationshipDetailModal';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import type { Character } from '../characters/CharacterProfileCard';
import { fetchCharacterById } from '../../lib/hydrateBookEntity';
import { invalidateCache } from '../../lib/requestCache';

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  character_id?: string | null;
  character_sex?: string | null;
  user_romantic_filter?: {
    user_sex?: string | null;
    user_orientation?: string | null;
    partner_sex?: string | null;
    reviewed?: boolean;
    eligible?: boolean;
    note?: string;
  };
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
};

export const RomanticRelationshipsView: React.FC = () => {
  const [relationships, setRelationships] = useState<RomanticRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'ended' | 'situationships'>('all');
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  useEffect(() => {
    loadRelationships();
  }, [activeFilter]);

  const loadRelationships = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter === 'active') {
        params.append('status', 'active');
        params.append('isCurrent', 'true');
      } else if (activeFilter === 'ended') {
        params.append('status', 'ended');
      }

      const data = await fetchJson<{ success: boolean; relationships: RomanticRelationship[] }>(
        `/api/conversation/romantic-relationships?${params.toString()}`
      );

      if (data.success) {
        let filtered = data.relationships;
        if (activeFilter === 'situationships') {
          filtered = data.relationships.filter(r => r.is_situationship);
        }
        setRelationships(filtered);
      }
    } catch (error) {
      console.error('Failed to load relationships:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAffection = async () => {
    try {
      await fetchJson('/api/conversation/romantic-relationships/calculate-affection', {
        method: 'POST',
      });
      await loadRelationships();
    } catch (error) {
      console.error('Failed to calculate affection:', error);
    }
  };

  const openCharacterCard = async (rel: RomanticRelationship) => {
    if (rel.person_type !== 'character') return;
    setRelationshipError(null);
    try {
      const character = await fetchCharacterById(rel.character_id ?? rel.person_id);
      setSelectedCharacter(character);
    } catch (error) {
      setRelationshipError(error instanceof Error ? error.message : 'Could not open Character Book card.');
    }
  };

  const linkRelationshipToCharacter = async (rel: RomanticRelationship) => {
    setLinkBusyId(rel.id);
    setRelationshipError(null);
    try {
      const result = await fetchJson<{ success: boolean; character_id: string }>(
        `/api/conversation/romantic-relationships/${rel.id}/link-character`,
        {
          method: 'POST',
          body: JSON.stringify({ character_name: rel.person_name }),
        }
      );
      invalidateCache();
      await loadRelationships();
      if (result.character_id) {
        const character = await fetchCharacterById(result.character_id);
        setSelectedCharacter(character);
      }
    } catch (error) {
      setRelationshipError(error instanceof Error ? error.message : 'Could not link relationship to Character Book.');
    } finally {
      setLinkBusyId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'ended':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'on_break':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'complicated':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">Loading relationships...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Heart className="w-5 h-5" />
                Romantic Relationships
              </CardTitle>
              <CardDescription>
                {relationships.length} relationship{relationships.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button onClick={calculateAffection} variant="outline" size="sm">
              Calculate Affection
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {relationshipError && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {relationshipError}
            </div>
          )}
          <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="situationships">Situationships</TabsTrigger>
              <TabsTrigger value="ended">Ended</TabsTrigger>
            </TabsList>

            <TabsContent value={activeFilter} className="mt-0">
              <div className="space-y-4">
                {relationships.length === 0 ? (
                  <div className="text-center text-white/60 py-8">
                    <p>No relationships found</p>
                    <p className="text-sm mt-2">Relationships will be automatically detected from your conversations!</p>
                  </div>
                ) : (
                  relationships.map((rel) => (
                    <Card
                      key={rel.id}
                      className="border-border/60 bg-black/30 cursor-pointer hover:bg-black/40 transition-colors"
                      onClick={() => setSelectedRelationship(rel.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  <h3 className="font-semibold text-white">
                                    {rel.person_name ?? rel.relationship_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                  </h3>
                                  <Badge variant="outline" className={`text-xs ${getStatusColor(rel.status)}`}>
                                    {rel.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs border-rose-500/30 text-rose-200 bg-rose-500/10">
                                    {rel.relationship_type.replace('_', ' ')}
                                  </Badge>
                                  {rel.is_situationship && (
                                    <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                                      Situationship
                                    </Badge>
                                  )}
                                  {rel.exclusivity_status && (
                                    <Badge variant="outline" className="text-xs">
                                      {rel.exclusivity_status}
                                    </Badge>
                                  )}
                                  {rel.character_sex && (
                                    <Badge variant="outline" className="text-xs border-white/15 text-white/60">
                                      {rel.character_sex}
                                    </Badge>
                                  )}
                                </div>
                                {rel.user_romantic_filter?.note && (
                                  <p className="text-xs text-white/45 max-w-2xl">
                                    {rel.user_romantic_filter.note}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                                {rel.person_type === 'character' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs border-white/15"
                                    leftIcon={<UserRound className="h-3.5 w-3.5" />}
                                    onClick={() => void openCharacterCard(rel)}
                                  >
                                    Character card
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={linkBusyId === rel.id}
                                    className="text-xs border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10"
                                    leftIcon={<Link2 className="h-3.5 w-3.5" />}
                                    onClick={() => void linkRelationshipToCharacter(rel)}
                                  >
                                    {linkBusyId === rel.id ? 'Linking...' : 'Link to Character Book'}
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                              <div>
                                <p className="text-xs text-white/50 mb-1">Affection</p>
                                <p className={`text-lg font-semibold ${getScoreColor(rel.affection_score)}`}>
                                  {Math.round(rel.affection_score * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Compatibility</p>
                                <p className={`text-lg font-semibold ${getScoreColor(rel.compatibility_score)}`}>
                                  {Math.round(rel.compatibility_score * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Health</p>
                                <p className={`text-lg font-semibold ${getScoreColor(rel.relationship_health)}`}>
                                  {Math.round(rel.relationship_health * 100)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-white/50 mb-1">Intensity</p>
                                <p className={`text-lg font-semibold ${getScoreColor(rel.emotional_intensity)}`}>
                                  {Math.round(rel.emotional_intensity * 100)}%
                                </p>
                              </div>
                            </div>

                            {(rel.strengths.length > 0 || rel.weaknesses.length > 0) && (
                              <div className="mt-4 flex gap-4">
                                {rel.strengths.length > 0 && (
                                  <div className="flex-1">
                                    <p className="text-xs text-green-300 mb-1">Strengths</p>
                                    <div className="flex flex-wrap gap-1">
                                      {rel.strengths.slice(0, 3).map((s, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
                                          {s}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {rel.weaknesses.length > 0 && (
                                  <div className="flex-1">
                                    <p className="text-xs text-red-300 mb-1">Weaknesses</p>
                                    <div className="flex flex-wrap gap-1">
                                      {rel.weaknesses.slice(0, 3).map((w, idx) => (
                                        <Badge key={idx} variant="outline" className="text-xs bg-red-500/20 text-red-300 border-red-500/30">
                                          {w}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {rel.red_flags.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-400" />
                                <span className="text-xs text-red-300">
                                  {rel.red_flags.length} red flag{rel.red_flags.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}

                            {rel.green_flags.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-green-300">
                                  {rel.green_flags.length} green flag{rel.green_flags.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedRelationship && (
        <RomanticRelationshipDetailModal
          relationshipId={selectedRelationship}
          onClose={() => setSelectedRelationship(null)}
        />
      )}
      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onUpdate={() => void loadRelationships()}
          relationship={relationships.find((rel) => rel.person_id === selectedCharacter.id)}
          initialTab="info"
        />
      )}
    </>
  );
};
