/**
 * Timeline Memory Tree Graph
 * Visual tree/graph showing memory points connected to timeline nodes
 */

import { useEffect, useRef, useState } from 'react';
import { Brain, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { TimelineNode, TimelineLayer } from '../../types/timeline';

type MemoryPoint = {
  id: string;
  content: string;
  date: string;
  tags: string[];
  node_id?: string;
  layer?: TimelineLayer;
};

type TimelineMemoryTreeProps = {
  nodes: TimelineNode[];
  onMemoryClick?: (memoryId: string) => void;
};

export const TimelineMemoryTree = ({
  nodes,
  onMemoryClick
}: TimelineMemoryTreeProps) => {
  const [memories, setMemories] = useState<MemoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMemories();
  }, [nodes]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      // Get all journal entries as memory points
      const response = await fetchJson<{ entries: Array<{
        id: string;
        content: string;
        date: string;
        tags: string[];
        chapter_id?: string | null;
      }> }>('/api/entries');
      
      const entries = response.entries || [];
      
      // Map entries to memory points and try to link them to timeline nodes
      const memoryPoints: MemoryPoint[] = entries.map(entry => {
        // Find which timeline node this entry belongs to based on date
        const entryDate = new Date(entry.date).getTime();
        let linkedNode: TimelineNode | undefined;
        let linkedLayer: TimelineLayer | undefined;

        // Check each node to see if entry falls within its date range
        for (const node of nodes) {
          const nodeStart = new Date(node.start_date).getTime();
          const nodeEnd = node.end_date ? new Date(node.end_date).getTime() : Date.now();
          
          if (entryDate >= nodeStart && entryDate <= nodeEnd) {
            // Determine layer based on node type (we'll need to pass layer info)
            // For now, try to infer from chapter_id
            if (entry.chapter_id) {
              linkedLayer = 'chapter';
            }
            linkedNode = node;
            break;
          }
        }

        return {
          id: entry.id,
          content: entry.content.substring(0, 100) + (entry.content.length > 100 ? '...' : ''),
          date: entry.date,
          tags: entry.tags || [],
          node_id: linkedNode?.id,
          layer: linkedLayer
        };
      });

      setMemories(memoryPoints);
    } catch (error) {
      console.error('Failed to load memories:', error);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Group memories by timeline node
  const memoriesByNode = new Map<string, MemoryPoint[]>();
  const unlinkedMemories: MemoryPoint[] = [];

  memories.forEach(memory => {
    if (memory.node_id) {
      if (!memoriesByNode.has(memory.node_id)) {
        memoriesByNode.set(memory.node_id, []);
      }
      memoriesByNode.get(memory.node_id)!.push(memory);
    } else {
      unlinkedMemories.push(memory);
    }
  });

  return (
    <Card className="bg-black/40 border-border/60 h-full flex flex-col">
      <CardContent className="p-4 flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-white">Memory Tree</h3>
          <Badge variant="outline" className="text-xs">
            {memories.length} memories
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-white/60">Loading memories...</div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto space-y-4 pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded"
          >
            {/* Memories linked to nodes */}
            {Array.from(memoriesByNode.entries()).map(([nodeId, nodeMemories]) => {
              const node = nodes.find(n => n.id === nodeId);
              return (
                <div key={nodeId} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="truncate">{node?.title || 'Unknown Node'}</span>
                    <Badge variant="outline" className="text-xs">
                      {nodeMemories.length}
                    </Badge>
                  </div>
                  <div className="ml-4 space-y-1">
                    {nodeMemories.slice(0, 5).map((memory) => (
                      <div
                        key={memory.id}
                        onClick={() => onMemoryClick?.(memory.id)}
                        className="p-2 rounded bg-black/40 border border-border/30 hover:border-primary/50 cursor-pointer transition-colors group"
                      >
                        <p className="text-xs text-white/70 line-clamp-2 group-hover:text-white transition-colors">
                          {memory.content}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-white/40">
                            {formatDate(memory.date)}
                          </span>
                          {memory.tags.length > 0 && (
                            <div className="flex gap-1">
                              {memory.tags.slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] px-1 py-0"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {nodeMemories.length > 5 && (
                      <div className="text-xs text-white/40 p-2">
                        +{nodeMemories.length - 5} more memories
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unlinked memories */}
            {unlinkedMemories.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-border/30">
                <div className="flex items-center gap-2 text-sm font-medium text-white/60">
                  <span>Unlinked Memories</span>
                  <Badge variant="outline" className="text-xs">
                    {unlinkedMemories.length}
                  </Badge>
                </div>
                <div className="ml-4 space-y-1">
                  {unlinkedMemories.slice(0, 10).map((memory) => (
                    <div
                      key={memory.id}
                      onClick={() => onMemoryClick?.(memory.id)}
                      className="p-2 rounded bg-black/40 border border-border/30 hover:border-primary/50 cursor-pointer transition-colors group"
                    >
                      <p className="text-xs text-white/60 line-clamp-2 group-hover:text-white/80 transition-colors">
                        {memory.content}
                      </p>
                      <span className="text-[10px] text-white/40 mt-1 block">
                        {formatDate(memory.date)}
                      </span>
                    </div>
                  ))}
                  {unlinkedMemories.length > 10 && (
                    <div className="text-xs text-white/40 p-2">
                      +{unlinkedMemories.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {memories.length === 0 && (
              <div className="text-center py-8 text-white/40">
                <Brain className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No memories found</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

