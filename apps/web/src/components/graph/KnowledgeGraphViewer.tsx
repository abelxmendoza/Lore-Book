import { useState, useEffect } from 'react';
import { Network, Loader2, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

type GraphEdge = {
  id: string;
  source_component_id: string;
  target_component_id: string;
  relationship_type: 'semantic' | 'social' | 'thematic' | 'narrative' | 'temporal' | 'emotional' | 'character' | 'location' | 'tag';
  weight: number;
  metadata?: Record<string, unknown>;
};

type KnowledgeGraphViewerProps = {
  componentId?: string;
};

const relationshipColors: Record<string, string> = {
  semantic: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  social: 'bg-green-500/20 text-green-300 border-green-500/30',
  thematic: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  narrative: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  temporal: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  emotional: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  character: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  location: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  tag: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

export const KnowledgeGraphViewer = ({ componentId }: KnowledgeGraphViewerProps) => {
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [minWeight, setMinWeight] = useState(0.5);

  useEffect(() => {
    loadEdges();
  }, [componentId, selectedType, minWeight]);

  const loadEdges = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (componentId) params.append('componentId', componentId);
      if (selectedType) params.append('relationshipType', selectedType);
      params.append('minWeight', minWeight.toString());
      params.append('limit', '100');

      const response = await fetchJson<{ edges: GraphEdge[] }>(
        `/api/graph/edges?${params.toString()}`
      );
      setEdges(response.edges || []);
    } catch (error) {
      console.error('Failed to load graph edges:', error);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  };

  const relationshipTypes = [
    'semantic',
    'social',
    'thematic',
    'narrative',
    'temporal',
    'emotional',
    'character',
    'location',
    'tag',
  ];

  const edgesByType = edges.reduce((acc, edge) => {
    if (!acc[edge.relationship_type]) {
      acc[edge.relationship_type] = [];
    }
    acc[edge.relationship_type].push(edge);
    return acc;
  }, {} as Record<string, GraphEdge[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/70 mb-2 block">Relationship Type</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedType === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedType(null)}
                  className="text-xs"
                >
                  All
                </Button>
                {relationshipTypes.map((type) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedType(selectedType === type ? null : type)}
                    className="text-xs"
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-white/70 mb-2 block">
                Minimum Weight: {minWeight.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={minWeight}
                onChange={(e) => setMinWeight(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {relationshipTypes.map((type) => {
          const count = edgesByType[type]?.length || 0;
          return (
            <Card key={type} className={`${relationshipColors[type]} border`}>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-white/60 mb-1 capitalize">{type}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edges List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Graph Edges ({edges.length})
          </h3>
        </div>

        {edges.length === 0 ? (
          <Card className="bg-black/40 border-border/60">
            <CardContent className="pt-6 text-center text-white/60">
              <Network className="h-12 w-12 mx-auto mb-4 text-white/20" />
              <p>No graph edges found.</p>
              {componentId && (
                <p className="text-sm mt-2">
                  This component doesn't have any relationships yet.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {edges.map((edge) => (
              <Card key={edge.id} className="bg-black/40 border-border/60">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={relationshipColors[edge.relationship_type]}>
                        {edge.relationship_type}
                      </Badge>
                      <span className="text-white/70 text-sm">
                        {edge.source_component_id.slice(0, 8)}... → {edge.target_component_id.slice(0, 8)}...
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {(edge.weight * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  {edge.metadata && Object.keys(edge.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-white/50">
                      {JSON.stringify(edge.metadata).slice(0, 100)}...
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

