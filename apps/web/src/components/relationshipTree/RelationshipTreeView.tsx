// =====================================================
// RELATIONSHIP TREE VIEW
// Purpose: Display relationship trees for any person (family, professional, educational, social)
// =====================================================

import { useState, useEffect } from 'react';
import { Users, Network, Building2, GraduationCap, Heart, Home, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';

type RelationshipCategory = 'family' | 'professional' | 'educational' | 'social' | 'residential' | 'all';

type RelationshipNode = {
  id: string;
  name: string;
  type: 'character' | 'omega_entity';
  category: RelationshipCategory;
  attributes?: {
    occupation?: string;
    workplace?: string;
    school?: string;
    degree?: string;
    current_city?: string;
    [key: string]: any;
  };
  relationships: Array<{
    toId: string;
    relationshipType: string;
    category: RelationshipCategory;
    confidence: number;
    evidence?: string;
  }>;
  metadata?: {
    pronouns?: string;
    avatar_url?: string;
  };
};

type RelationshipTree = {
  rootNode: RelationshipNode;
  nodes: RelationshipNode[];
  relationships: Array<{
    fromId: string;
    toId: string;
    type: string;
    category: RelationshipCategory;
    confidence: number;
  }>;
  memberCount: number;
  relationshipCount: number;
  categories: RelationshipCategory[];
};

interface RelationshipTreeViewProps {
  entityId: string;
  entityType?: 'omega_entity' | 'character';
  onNodeClick?: (nodeId: string) => void;
}

export const RelationshipTreeView: React.FC<RelationshipTreeViewProps> = ({
  entityId,
  entityType = 'character',
  onNodeClick,
}) => {
  const [tree, setTree] = useState<RelationshipTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<RelationshipCategory>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([entityId]));

  useEffect(() => {
    loadTree();
  }, [entityId, entityType, activeCategory]);

  const loadTree = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ success: boolean; tree: RelationshipTree }>(
        `/api/conversation/relationship-trees/${entityId}?category=${activeCategory}&entityType=${entityType}`
      );
      if (data.success) {
        setTree(data.tree);
        setExpandedNodes(new Set([entityId]));
      }
    } catch (error) {
      console.error('Failed to load relationship tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const rebuildTree = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ success: boolean; tree: RelationshipTree }>(
        `/api/conversation/relationship-trees/${entityId}/rebuild`,
        {
          method: 'POST',
          body: JSON.stringify({ category: activeCategory, entityType }),
        }
      );
      if (data.success) {
        setTree(data.tree);
      }
    } catch (error) {
      console.error('Failed to rebuild tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getCategoryIcon = (category: RelationshipCategory) => {
    switch (category) {
      case 'family':
        return <Heart className="w-4 h-4" />;
      case 'professional':
        return <Building2 className="w-4 h-4" />;
      case 'educational':
        return <GraduationCap className="w-4 h-4" />;
      case 'social':
        return <Users className="w-4 h-4" />;
      case 'residential':
        return <Home className="w-4 h-4" />;
      default:
        return <Network className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: RelationshipCategory) => {
    switch (category) {
      case 'family':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
      case 'professional':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'educational':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'social':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'residential':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  const renderNode = (node: RelationshipNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.relationships.length > 0;

    return (
      <div key={node.id} className="ml-4">
        <div
          className={`flex items-center gap-2 p-2 rounded mb-1 cursor-pointer hover:bg-white/5 ${
            node.id === entityId ? 'bg-primary/20 border border-primary/30' : ''
          }`}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => {
            if (onNodeClick) {
              onNodeClick(node.id);
            }
            if (hasChildren) {
              toggleNode(node.id);
            }
          }}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
              className="w-4 h-4 flex items-center justify-center text-white/50 hover:text-white"
            >
              {isExpanded ? '−' : '+'}
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{node.name}</span>
              {node.attributes?.occupation && (
                <Badge variant="outline" className="text-xs">
                  {node.attributes.occupation}
                </Badge>
              )}
              {node.attributes?.workplace && (
                <Badge variant="outline" className="text-xs">
                  @ {node.attributes.workplace}
                </Badge>
              )}
              {node.attributes?.school && (
                <Badge variant="outline" className="text-xs">
                  🎓 {node.attributes.school}
                </Badge>
              )}
            </div>
            {node.relationships.length > 0 && (
              <div className="text-xs text-white/50 mt-1">
                {node.relationships.length} relationship(s)
              </div>
            )}
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="ml-4">
            {node.relationships.map((rel) => {
              const childNode = tree?.nodes.find((n) => n.id === rel.toId);
              if (!childNode) return null;

              return (
                <div key={rel.toId} className="border-l-2 border-white/10 pl-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getCategoryColor(rel.category)}`}
                    >
                      {rel.relationshipType.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-white/40">→</span>
                  </div>
                  {renderNode(childNode, level + 1)}
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
          <div className="text-center text-white/60">Loading relationship tree...</div>
        </CardContent>
      </Card>
    );
  }

  if (!tree) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">
            <p className="mb-4">No relationship tree found</p>
            <Button onClick={rebuildTree} variant="outline">
              Build Tree
            </Button>
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
              <Network className="w-5 h-5" />
              Relationship Tree
            </CardTitle>
            <CardDescription>
              {tree.memberCount} members • {tree.relationshipCount} relationships
            </CardDescription>
          </div>
          <Button onClick={rebuildTree} variant="outline" size="sm">
            Rebuild
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as RelationshipCategory)}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              <Network className="w-4 h-4 mr-2" />
              All
            </TabsTrigger>
            {tree.categories.includes('family') && (
              <TabsTrigger value="family">
                <Heart className="w-4 h-4 mr-2" />
                Family
              </TabsTrigger>
            )}
            {tree.categories.includes('professional') && (
              <TabsTrigger value="professional">
                <Building2 className="w-4 h-4 mr-2" />
                Professional
              </TabsTrigger>
            )}
            {tree.categories.includes('educational') && (
              <TabsTrigger value="educational">
                <GraduationCap className="w-4 h-4 mr-2" />
                Educational
              </TabsTrigger>
            )}
            {tree.categories.includes('social') && (
              <TabsTrigger value="social">
                <Users className="w-4 h-4 mr-2" />
                Social
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-0">
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {renderNode(tree.rootNode)}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
