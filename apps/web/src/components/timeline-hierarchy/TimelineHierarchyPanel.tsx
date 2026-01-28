/**
 * Timeline Hierarchy Panel
 * Main component for viewing and managing the 9-layer timeline hierarchy
 */

import { useState, useEffect } from 'react';
import { Layers, Search, Plus, Sparkles, ChevronRight, ChevronDown, Loader2, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { TimelineTreeNode } from './TimelineTreeNode';
import { CreateNodeModal } from './CreateNodeModal';
import { TimelineNodeEditor } from './TimelineNodeEditor';
import { TimelineMemoryTree } from './TimelineMemoryTree';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { TimelineNodeDetailModal } from './TimelineNodeDetailModal';
import { ThreadTimelineView } from '../threads/ThreadTimelineView';
import { useTimelineHierarchy } from '../../hooks/useTimelineHierarchy';
import { TimelineLayer, LAYER_COLORS, TimelineNode } from '../../types/timeline';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';

type ViewMode = 'hierarchy' | 'threads';
type ThreadItem = { id: string; name: string; description?: string | null; category?: string | null };

export const TimelineHierarchyPanel = () => {
  const {
    mythos,
    loading,
    search,
    refresh,
    recommendations,
    getChildren
  } = useTimelineHierarchy();

  // Flatten all nodes for memory tree
  const getAllNodes = (nodes: TimelineNode[]): TimelineNode[] => {
    const all: TimelineNode[] = [];
    const traverse = (nodeList: TimelineNode[]) => {
      for (const node of nodeList) {
        all.push(node);
        // Note: We'd need to load children recursively, but for now just use top-level nodes
      }
    };
    traverse(nodes);
    return all;
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<TimelineLayer | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLayer, setCreateLayer] = useState<TimelineLayer>('mythos');
  
  // Load full hierarchy for nested timeline
  const [hierarchyNodes, setHierarchyNodes] = useState<TimelineNode[]>([]);
  const [currentTimelineItem, setCurrentTimelineItem] = useState<string | undefined>();
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [selectedNode, setSelectedNode] = useState<{ node: TimelineNode; layer: TimelineLayer } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('hierarchy');
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);

  // Recursively load all children for a node, adding layer info to metadata
  const loadNodeWithChildren = async (node: TimelineNode, layer: TimelineLayer): Promise<TimelineNode[]> => {
    // Add layer to node metadata
    const nodeWithLayer: TimelineNode = {
      ...node,
      metadata: {
        ...node.metadata,
        layer
      }
    };
    const allNodes: TimelineNode[] = [nodeWithLayer];
    
    // Determine child layer based on hierarchy
    const childLayerMap: Record<TimelineLayer, TimelineLayer | null> = {
      mythos: 'epoch',
      epoch: 'era',
      era: 'saga',
      saga: 'arc',
      arc: 'chapter',
      chapter: 'scene',
      scene: 'action',
      action: 'microaction',
      microaction: null
    };
    
    const childLayer = childLayerMap[layer];
    if (childLayer) {
      try {
        const children = await getChildren(childLayer, node.id);
        for (const child of children) {
          const childNodes = await loadNodeWithChildren(child, childLayer);
          allNodes.push(...childNodes);
        }
      } catch (error) {
        console.error(`Failed to load children for ${layer} ${node.id}:`, error);
      }
    }
    
    return allNodes;
  };

  useEffect(() => {
    // Load full hierarchy starting from mythos
    const loadFullHierarchy = async () => {
      try {
        const allNodes: TimelineNode[] = [];
        for (const mythosNode of mythos) {
          const nodes = await loadNodeWithChildren(mythosNode, 'mythos');
          allNodes.push(...nodes);
        }
        setHierarchyNodes(allNodes);
      } catch (error) {
        console.error('Failed to load full hierarchy:', error);
      }
    };

    if (mythos.length > 0) {
      loadFullHierarchy();
    }
  }, [mythos]);

  useEffect(() => {
    if (viewMode !== 'threads') return;
    const loadThreads = async () => {
      setLoadingThreads(true);
      try {
        const list = await fetchJson<ThreadItem[]>('/api/threads');
        setThreads(list ?? []);
        if (!selectedThreadId && (list ?? []).length > 0) {
          setSelectedThreadId((list ?? [])[0].id);
        }
      } catch (e) {
        console.error('Failed to load threads:', e);
        setThreads([]);
      } finally {
        setLoadingThreads(false);
      }
    };
    loadThreads();
  }, [viewMode]);

  const handleTimelineItemClick = async (item: any) => {
    setCurrentTimelineItem(item.id);
    
    // Check if it's a hierarchy node (era, saga, arc, etc.)
    const hierarchyLayerTypes: TimelineLayer[] = ['mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'microaction'];
    const isHierarchyNode = hierarchyLayerTypes.includes(item.type as TimelineLayer);
    
    if (isHierarchyNode) {
      // Find the node in hierarchyNodes
      const node = hierarchyNodes.find(n => n.id === item.id);
      if (node) {
        // Get layer from metadata or infer from type
        const layer = (node.metadata?.layer as TimelineLayer) || (item.type as TimelineLayer);
        setSelectedNode({ node, layer });
        return;
      }
      
      // If not found locally, fetch it
      try {
        const layer = item.type as TimelineLayer;
        const fetchedNode = await fetchJson<{ node: TimelineNode }>(
          `/api/timeline/${layer}/${item.id}`
        );
        setSelectedNode({ node: fetchedNode.node, layer });
      } catch (error) {
        console.error('Failed to load hierarchy node:', error);
      }
      return;
    }
    
    // If it's an entry/memory, open MemoryDetailModal
    if (item.type === 'entry' || item.entryId || (item.type === 'memory')) {
      const entryId = item.entryId || item.id;
      try {
        const entry = await fetchJson<{
          id: string;
          date: string;
          content: string;
          summary?: string | null;
          tags: string[];
          mood?: string | null;
          chapter_id?: string | null;
          source: string;
          metadata?: Record<string, unknown>;
        }>(`/api/entries/${entryId}`);
        const memoryCard = memoryEntryToCard(entry);
        setSelectedMemory(memoryCard);
        
        // Load all entries for navigation
        const allEntries = await fetchJson<Array<{
          id: string;
          date: string;
          content: string;
          summary?: string | null;
          tags: string[];
          mood?: string | null;
          chapter_id?: string | null;
          source: string;
          metadata?: Record<string, unknown>;
        }>>('/api/entries/recent?limit=100');
        const memoryCards = allEntries.map(e => memoryEntryToCard(e));
        setAllMemories(memoryCards);
      } catch (error) {
        console.error('Failed to load entry:', error);
      }
    }
  };

  const handleSearch = async () => {
    if (searchTerm.trim()) {
      await search({ text: searchTerm });
    } else {
      await refresh();
    }
  };

  const handleCreateNode = (layer: TimelineLayer) => {
    setCreateLayer(layer);
    setShowCreateModal(true);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Color-Coded Timeline - Main visualization with nested hierarchy */}
      <div className="flex-shrink-0 border-b border-border/60 bg-black/50">
        <ColorCodedTimeline
          hierarchyNodes={hierarchyNodes}
          currentItemId={currentTimelineItem}
          onItemClick={handleTimelineItemClick}
          showLabel={true}
        />
      </div>

      {/* Header */}
      <Card className="bg-black/40 border-border/60 flex-shrink-0">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Layers className="h-6 w-6 text-primary" />
              <CardTitle className="text-white">Timeline Hierarchy</CardTitle>
              <div className="flex rounded-lg border border-border/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('hierarchy')}
                  className={`px-3 py-1.5 text-sm ${viewMode === 'hierarchy' ? 'bg-primary/30 text-white' : 'bg-black/30 text-white/70 hover:text-white'}`}
                >
                  Hierarchy
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('threads')}
                  className={`px-3 py-1.5 text-sm flex items-center gap-1 ${viewMode === 'threads' ? 'bg-primary/30 text-white' : 'bg-black/30 text-white/70 hover:text-white'}`}
                >
                  <GitBranch className="h-4 w-4" />
                  By thread
                </button>
              </div>
            </div>
            {viewMode === 'hierarchy' && (
              <Button
                onClick={() => handleCreateNode('mythos')}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                New Mythos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="text"
                placeholder="Search timeline hierarchy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-white">Recommendations</span>
              </div>
              <div className="space-y-1">
                {recommendations.slice(0, 3).map((rec, idx) => (
                  <div key={idx} className="text-xs text-white/70">
                    • {rec.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Layer Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(LAYER_COLORS).map(([layer, color]) => (
              <div key={layer} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-white/60 capitalize">{layer}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content - Split View */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0 overflow-x-hidden">
        {viewMode === 'threads' ? (
          <>
            <Card className="bg-black/40 border-border/60 w-56 flex-shrink-0 flex flex-col overflow-hidden">
              <CardContent className="p-4 flex-1 flex flex-col overflow-hidden">
                <h3 className="text-lg font-semibold text-white mb-3">Threads</h3>
                {loadingThreads ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : threads.length === 0 ? (
                  <p className="text-sm text-white/50">No threads yet. Add nodes to threads from saga/arc detail.</p>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/20">
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedThreadId(t.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm truncate ${selectedThreadId === t.id ? 'bg-primary/30 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex-1 overflow-y-auto min-w-0 p-4">
              {selectedThreadId && (
                <ThreadTimelineView
                  threadId={selectedThreadId}
                  threadName={threads.find((t) => t.id === selectedThreadId)?.name}
                  onNodeClick={(nodeId, nodeType) => {
                    const node = hierarchyNodes.find((n) => n.id === nodeId);
                    if (node) {
                      const layer = (node.metadata?.layer as TimelineLayer) ?? (nodeType as TimelineLayer);
                      setSelectedNode({ node, layer });
                    }
                  }}
                />
              )}
              {!selectedThreadId && threads.length > 0 && (
                <div className="flex items-center justify-center py-12 text-white/50">
                  Select a thread
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Timeline Tree - Scrollable */}
            <Card className="bg-black/40 border-border/60 flex-1 flex flex-col overflow-hidden min-w-0 overflow-x-hidden">
              <CardContent className="p-4 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h3 className="text-lg font-semibold text-white">Timeline Hierarchy</h3>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : mythos.length === 0 ? (
                    <div className="text-center py-12 text-white/60">
                      <Layers className="h-12 w-12 mx-auto mb-4 text-white/20" />
                      <p className="text-lg font-medium mb-2">No timeline hierarchy yet</p>
                      <p className="text-sm mb-4">Create your first Mythos to get started</p>
                      <Button onClick={() => handleCreateNode('mythos')}>
                        Create Mythos
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mythos.map((mythosNode) => (
                        <TimelineTreeNode
                          key={mythosNode.id}
                          node={mythosNode}
                          layer="mythos"
                          onNodeClick={(nodeId, layer) => {
                            setSelectedNodeId(nodeId);
                            setSelectedLayer(layer);
                          }}
                          onCreateChild={(layer) => handleCreateNode(layer)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Memory Tree - Fixed Width */}
            <div className="w-80 flex-shrink-0">
              <TimelineMemoryTree
                nodes={getAllNodes(mythos)}
                onMemoryClick={(memoryId) => {
                  console.log('Memory clicked:', memoryId);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Create Node Modal */}
      {showCreateModal && (
        <CreateNodeModal
          layer={createLayer}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refresh();
          }}
        />
      )}

      {/* Node Editor Drawer */}
      {selectedNodeId && selectedLayer && (
        <TimelineNodeEditor
          nodeId={selectedNodeId}
          layer={selectedLayer}
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedLayer(null);
          }}
          onUpdated={refresh}
        />
      )}

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = allMemories.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={allMemories}
        />
      )}

      {/* Timeline Node Detail Modal */}
      {selectedNode && (
        <TimelineNodeDetailModal
          node={selectedNode.node}
          layer={selectedNode.layer}
          onClose={() => setSelectedNode(null)}
          onUpdate={() => {
            setSelectedNode(null);
            refresh();
          }}
        />
      )}
    </div>
  );
};

