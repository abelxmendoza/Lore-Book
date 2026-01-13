// =====================================================
// SKILL NETWORK VIEW
// Purpose: Display skill networks showing prerequisites, synergies, and learning paths
// =====================================================

import { useState, useEffect } from 'react';
import { Brain, TrendingUp, BookOpen, Target, Network, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';

type SkillRelationshipType =
  | 'prerequisite_for'
  | 'requires'
  | 'builds_on'
  | 'foundation_for'
  | 'complements'
  | 'synergizes_with'
  | 'related_to'
  | 'specialization_of'
  | 'generalization_of'
  | 'alternative_to'
  | 'evolves_into'
  | 'learned_with'
  | 'practiced_with'
  | 'taught_with'
  | 'transfers_to'
  | 'applies_to';

type SkillNode = {
  id: string;
  name: string;
  category: string;
  level: number;
  totalXp: number;
  relationships: Array<{
    toId: string;
    relationshipType: SkillRelationshipType;
    confidence: number;
    strength?: number;
    evidence?: string;
  }>;
  metadata?: {
    description?: string;
    first_mentioned_at?: string;
    last_practiced_at?: string;
  };
};

type SkillNetwork = {
  rootSkill: SkillNode | null;
  skills: SkillNode[];
  relationships: Array<{
    fromId: string;
    toId: string;
    type: SkillRelationshipType;
    confidence: number;
    strength?: number;
  }>;
  clusters: Array<{
    id: string;
    name: string;
    skillIds: string[];
    type?: string;
  }>;
  skillCount: number;
  relationshipCount: number;
};

export const SkillNetworkView: React.FC = () => {
  const [network, setNetwork] = useState<SkillNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'prerequisites' | 'synergies' | 'learning_paths'>('all');
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNetwork();
  }, []);

  const loadNetwork = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ success: boolean; network: SkillNetwork }>(
        '/api/conversation/skill-network'
      );
      if (data.success) {
        setNetwork(data.network);
        if (data.network.rootSkill) {
          setExpandedSkills(new Set([data.network.rootSkill.id]));
        }
      }
    } catch (error) {
      console.error('Failed to load skill network:', error);
    } finally {
      setLoading(false);
    }
  };

  const detectClusters = async () => {
    try {
      await fetchJson('/api/conversation/skill-network/detect-clusters', {
        method: 'POST',
      });
      await loadNetwork();
    } catch (error) {
      console.error('Failed to detect clusters:', error);
    }
  };

  const toggleSkill = (skillId: string) => {
    const newExpanded = new Set(expandedSkills);
    if (newExpanded.has(skillId)) {
      newExpanded.delete(skillId);
    } else {
      newExpanded.add(skillId);
    }
    setExpandedSkills(newExpanded);
  };

  const getRelationshipColor = (type: SkillRelationshipType) => {
    if (type.includes('prerequisite') || type === 'requires' || type === 'builds_on') {
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
    if (type === 'synergizes_with' || type === 'complements') {
      return 'bg-green-500/20 text-green-300 border-green-500/30';
    }
    if (type === 'learned_with' || type === 'practiced_with') {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
    return 'bg-white/10 text-white/70 border-white/20';
  };

  const getRelationshipIcon = (type: SkillRelationshipType) => {
    if (type.includes('prerequisite') || type === 'requires') {
      return '→';
    }
    if (type === 'synergizes_with' || type === 'complements') {
      return '↔';
    }
    return '—';
  };

  const renderSkill = (skill: SkillNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedSkills.has(skill.id);
    const hasRelationships = skill.relationships.length > 0;

    const filteredRels = skill.relationships.filter(rel => {
      if (activeFilter === 'prerequisites') {
        return rel.relationshipType.includes('prerequisite') || rel.relationshipType === 'requires' || rel.relationshipType === 'builds_on';
      }
      if (activeFilter === 'synergies') {
        return rel.relationshipType === 'synergizes_with' || rel.relationshipType === 'complements';
      }
      if (activeFilter === 'learning_paths') {
        return rel.relationshipType === 'learned_with' || rel.relationshipType === 'practiced_with' || rel.relationshipType === 'evolves_into';
      }
      return true;
    });

    return (
      <div key={skill.id} className="ml-4">
        <div
          className={`flex items-center gap-2 p-3 rounded mb-2 cursor-pointer hover:bg-white/5 border border-white/10 ${
            network?.rootSkill?.id === skill.id ? 'bg-primary/20 border-primary/30' : ''
          }`}
          style={{ marginLeft: `${level * 24}px` }}
          onClick={() => {
            if (hasRelationships) {
              toggleSkill(skill.id);
            }
          }}
        >
          {hasRelationships && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSkill(skill.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-white/50 hover:text-white rounded"
            >
              {isExpanded ? '−' : '+'}
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white">{skill.name}</span>
              <Badge variant="outline" className="text-xs">
                {skill.category}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Level {skill.level}
              </Badge>
              <span className="text-xs text-white/40">{skill.totalXp} XP</span>
            </div>
            {skill.metadata?.description && (
              <p className="text-xs text-white/60 mt-1">{skill.metadata.description}</p>
            )}
          </div>
        </div>
        {isExpanded && filteredRels.length > 0 && (
          <div className="ml-4">
            {filteredRels.map((rel) => {
              const targetSkill = network?.skills.find(s => s.id === rel.toId);
              if (!targetSkill) return null;

              return (
                <div key={rel.toId} className="border-l-2 border-white/10 pl-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getRelationshipColor(rel.relationshipType)}`}
                    >
                      {getRelationshipIcon(rel.relationshipType)} {rel.relationshipType.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-white/40">
                      {Math.round(rel.confidence * 100)}% confidence
                    </span>
                  </div>
                  {renderSkill(targetSkill, level + 1)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">Loading skill network...</div>
        </CardContent>
      </Card>
    );
  }

  if (!network || network.skillCount === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">
            <p className="mb-4">No skills found</p>
            <p className="text-sm">Start tracking skills in your conversations!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-black/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Skill Network
            </CardTitle>
            <CardDescription>
              {network.skillCount} skills • {network.relationshipCount} relationships
              {network.clusters.length > 0 && ` • ${network.clusters.length} clusters`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={detectClusters} variant="outline" size="sm">
              Detect Clusters
            </Button>
            <Button onClick={loadNetwork} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              <Network className="w-4 h-4 mr-2" />
              All
            </TabsTrigger>
            <TabsTrigger value="prerequisites">
              <BookOpen className="w-4 h-4 mr-2" />
              Prerequisites
            </TabsTrigger>
            <TabsTrigger value="synergies">
              <TrendingUp className="w-4 h-4 mr-2" />
              Synergies
            </TabsTrigger>
            <TabsTrigger value="learning_paths">
              <Target className="w-4 h-4 mr-2" />
              Learning Paths
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter} className="mt-0">
            {/* Skill Clusters */}
            {network.clusters.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white/60 mb-3">Skill Clusters</h3>
                <div className="flex flex-wrap gap-2">
                  {network.clusters.map((cluster) => (
                    <Badge key={cluster.id} variant="outline" className="text-xs">
                      {cluster.name} ({cluster.skillIds.length} skills)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Skill Tree */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {network.rootSkill ? (
                renderSkill(network.rootSkill)
              ) : (
                network.skills.map((skill) => renderSkill(skill))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
