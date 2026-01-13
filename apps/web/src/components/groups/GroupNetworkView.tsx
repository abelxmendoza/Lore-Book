// =====================================================
// GROUP NETWORK VIEW
// Purpose: Display group networks showing hierarchies, affiliations, and evolution
// =====================================================

import { useState, useEffect } from 'react';
import { Users, Network, Building2, GitBranch, History, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';

type GroupRelationshipType =
  | 'parent_group_of'
  | 'subgroup_of'
  | 'chapter_of'
  | 'branch_of'
  | 'affiliated_with'
  | 'partner_of'
  | 'competitor_of'
  | 'merged_with'
  | 'split_from'
  | 'succeeded_by'
  | 'overlaps_with'
  | 'exclusive_with'
  | 'recruits_from'
  | 'evolved_from'
  | 'replaced_by'
  | 'predecessor_of';

type GroupNode = {
  id: string;
  name: string;
  type?: string;
  members: string[];
  relationships: Array<{
    toId: string;
    relationshipType: GroupRelationshipType;
    confidence: number;
    evidence?: string;
    startTime?: string;
    endTime?: string;
  }>;
  attributes?: {
    purpose?: string;
    location?: string;
    frequency?: string;
    status?: string;
    founded_date?: string;
  };
  metadata?: {
    theme?: string;
    cohesion?: number;
    size?: number;
  };
};

type GroupNetwork = {
  rootGroup: GroupNode | null;
  groups: GroupNode[];
  relationships: Array<{
    fromId: string;
    toId: string;
    type: GroupRelationshipType;
    confidence: number;
  }>;
  evolution: Array<{
    groupId: string;
    eventType: string;
    eventDate: string;
    description?: string;
  }>;
  groupCount: number;
  relationshipCount: number;
};

export const GroupNetworkView: React.FC = () => {
  const [network, setNetwork] = useState<GroupNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'hierarchies' | 'affiliations' | 'evolution'>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNetwork();
  }, []);

  const loadNetwork = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ success: boolean; network: GroupNetwork }>(
        '/api/conversation/group-network'
      );
      if (data.success) {
        setNetwork(data.network);
        if (data.network.rootGroup) {
          setExpandedGroups(new Set([data.network.rootGroup.id]));
        }
      }
    } catch (error) {
      console.error('Failed to load group network:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const getRelationshipColor = (type: GroupRelationshipType) => {
    if (type.includes('parent') || type.includes('subgroup') || type.includes('chapter') || type.includes('branch')) {
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
    if (type === 'affiliated_with' || type === 'partner_of' || type === 'overlaps_with') {
      return 'bg-green-500/20 text-green-300 border-green-500/30';
    }
    if (type === 'merged_with' || type === 'split_from' || type === 'evolved_from') {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
    if (type === 'competitor_of') {
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    }
    return 'bg-white/10 text-white/70 border-white/20';
  };

  const renderGroup = (group: GroupNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedGroups.has(group.id);
    const hasRelationships = group.relationships.length > 0;

    const filteredRels = group.relationships.filter(rel => {
      if (activeFilter === 'hierarchies') {
        return rel.relationshipType.includes('parent') || rel.relationshipType.includes('subgroup') || 
               rel.relationshipType.includes('chapter') || rel.relationshipType.includes('branch');
      }
      if (activeFilter === 'affiliations') {
        return rel.relationshipType === 'affiliated_with' || rel.relationshipType === 'partner_of' || 
               rel.relationshipType === 'overlaps_with';
      }
      if (activeFilter === 'evolution') {
        return rel.relationshipType === 'merged_with' || rel.relationshipType === 'split_from' || 
               rel.relationshipType === 'evolved_from' || rel.relationshipType === 'replaced_by';
      }
      return true;
    });

    return (
      <div key={group.id} className="ml-4">
        <div
          className={`flex items-center gap-2 p-3 rounded mb-2 cursor-pointer hover:bg-white/5 border border-white/10 ${
            network?.rootGroup?.id === group.id ? 'bg-primary/20 border-primary/30' : ''
          }`}
          style={{ marginLeft: `${level * 24}px` }}
          onClick={() => {
            if (hasRelationships) {
              toggleGroup(group.id);
            }
          }}
        >
          {hasRelationships && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(group.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-white/50 hover:text-white rounded"
            >
              {isExpanded ? '−' : '+'}
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white">{group.name}</span>
              {group.type && (
                <Badge variant="outline" className="text-xs">
                  {group.type}
                </Badge>
              )}
              {group.attributes?.status && (
                <Badge variant="outline" className="text-xs">
                  {group.attributes.status}
                </Badge>
              )}
              <span className="text-xs text-white/40">{group.members.length} members</span>
            </div>
            {group.attributes?.purpose && (
              <p className="text-xs text-white/60 mt-1">{group.attributes.purpose}</p>
            )}
            {group.attributes?.location && (
              <p className="text-xs text-white/50 mt-1">📍 {group.attributes.location}</p>
            )}
          </div>
        </div>
        {isExpanded && filteredRels.length > 0 && (
          <div className="ml-4">
            {filteredRels.map((rel) => {
              const targetGroup = network?.groups.find(g => g.id === rel.toId);
              if (!targetGroup) return null;

              return (
                <div key={rel.toId} className="border-l-2 border-white/10 pl-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getRelationshipColor(rel.relationshipType)}`}
                    >
                      {rel.relationshipType.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-white/40">
                      {Math.round(rel.confidence * 100)}% confidence
                    </span>
                  </div>
                  {renderGroup(targetGroup, level + 1)}
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
          <div className="text-center text-white/60">Loading group network...</div>
        </CardContent>
      </Card>
    );
  }

  if (!network || network.groupCount === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">
            <p className="mb-4">No groups found</p>
            <p className="text-sm">Groups will be automatically detected from your conversations!</p>
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
              <Users className="w-5 h-5" />
              Group Network
            </CardTitle>
            <CardDescription>
              {network.groupCount} groups • {network.relationshipCount} relationships
              {network.evolution.length > 0 && ` • ${network.evolution.length} evolution events`}
            </CardDescription>
          </div>
          <Button onClick={loadNetwork} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              <Network className="w-4 h-4 mr-2" />
              All
            </TabsTrigger>
            <TabsTrigger value="hierarchies">
              <Building2 className="w-4 h-4 mr-2" />
              Hierarchies
            </TabsTrigger>
            <TabsTrigger value="affiliations">
              <GitBranch className="w-4 h-4 mr-2" />
              Affiliations
            </TabsTrigger>
            <TabsTrigger value="evolution">
              <History className="w-4 h-4 mr-2" />
              Evolution
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter} className="mt-0">
            {/* Evolution Timeline */}
            {activeFilter === 'evolution' && network.evolution.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white/60 mb-3">Group Evolution Timeline</h3>
                <div className="space-y-2">
                  {network.evolution.map((event, idx) => {
                    const group = network.groups.find(g => g.id === event.groupId);
                    return (
                      <div key={idx} className="p-3 rounded bg-white/5 border border-white/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {event.eventType}
                          </Badge>
                          <span className="text-xs text-white/40">{event.eventDate}</span>
                        </div>
                        <p className="text-sm text-white/80">
                          <span className="font-medium">{group?.name || 'Unknown Group'}</span>
                          {event.description && `: ${event.description}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group Tree */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {network.rootGroup ? (
                renderGroup(network.rootGroup)
              ) : (
                network.groups.map((group) => renderGroup(group))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
