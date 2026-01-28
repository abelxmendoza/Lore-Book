import { useState, useEffect } from 'react';
import { X, Calendar, Tag, Sparkles, Layers, FileText, RefreshCw, Loader2, Link2, GitBranch, Plus, Minus } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { TimelineLayer, TimelineNode, LAYER_COLORS } from '../../types/timeline';

type ThreadContext = { id: string; name: string; description?: string | null; category?: string | null; membership_id?: string; role?: string | null };
type RelationContext = { direction: 'incoming' | 'outgoing'; relation_type: string; other_node: { id: string; type: string; title: string } };
type NodeContext = { threads: ThreadContext[]; relations: RelationContext[] };

const RELATION_TYPES = ['parallel_to', 'paused_by', 'displaced_by', 'influenced_by'] as const;

type TimelineNodeDetailModalProps = {
  node: TimelineNode;
  layer: TimelineLayer;
  onClose: () => void;
  onUpdate?: () => void;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const layerLabels: Record<TimelineLayer, string> = {
  mythos: 'Mythos',
  epoch: 'Epoch',
  era: 'Era',
  saga: 'Saga',
  arc: 'Arc',
  chapter: 'Chapter',
  scene: 'Scene',
  action: 'Action',
  microaction: 'Micro-Action'
};

const SAGA_ARC_LAYERS: TimelineLayer[] = ['saga', 'arc'];

export const TimelineNodeDetailModal = ({ node, layer, onClose, onUpdate }: TimelineNodeDetailModalProps) => {
  const [summary, setSummary] = useState<string | null>(node.description || null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [children, setChildren] = useState<TimelineNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(node.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [allThreads, setAllThreads] = useState<ThreadContext[]>([]);
  const [addingToThread, setAddingToThread] = useState<string | null>(null);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [relationType, setRelationType] = useState<string>('parallel_to');
  const [targetNode, setTargetNode] = useState<{ id: string; type: TimelineLayer; title: string } | null>(null);
  const [relationCandidates, setRelationCandidates] = useState<Array<{ id: string; type: TimelineLayer; title: string }>>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [addingRelation, setAddingRelation] = useState(false);

  useEffect(() => {
    // Load summary if not present
    if (!summary && node.id) {
      loadSummary();
    }
    
    // Load children
    loadChildren();

    // Load threads/relations when saga or arc
    if (node.id && SAGA_ARC_LAYERS.includes(layer)) {
      loadNodeContext();
    }
  }, [node.id, layer]);

  const loadSummary = async () => {
    if (!node.id) return;
    
    setLoadingSummary(true);
    try {
      const response = await fetchJson<{ summary: string }>(
        `/api/timeline/${layer}/${node.id}/auto-summary`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ update: false })
        }
      );
      setSummary(response.summary || null);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadChildren = async () => {
    if (!node.id) return;
    
    setLoadingChildren(true);
    try {
      const response = await fetchJson<{ children: TimelineNode[] }>(
        `/api/timeline/${layer}/${node.id}/children`
      );
      setChildren(response.children || []);
    } catch (error) {
      console.error('Failed to load children:', error);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleRegenerateTitle = async () => {
    if (!node.id) return;
    
    setGeneratingTitle(true);
    try {
      const response = await fetchJson<{ title: string }>(
        `/api/timeline/${layer}/${node.id}/auto-title`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ update: true })
        }
      );
      setEditedTitle(response.title);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to regenerate title:', error);
    } finally {
      setGeneratingTitle(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!node.id || !editedTitle.trim()) return;
    
    setSavingTitle(true);
    try {
      await fetchJson(
        `/api/timeline/${layer}/update/${node.id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editedTitle.trim() })
        }
      );
      setIsEditingTitle(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to save title:', error);
      alert('Failed to save title. Please try again.');
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCancelEditTitle = () => {
    setEditedTitle(node.title);
    setIsEditingTitle(false);
  };

  const loadNodeContext = async () => {
    if (!node.id || !SAGA_ARC_LAYERS.includes(layer)) return;
    setLoadingContext(true);
    try {
      const ctx = await fetchJson<NodeContext>(`/api/threads/nodes/${layer}/${node.id}/context`);
      setNodeContext(ctx);
    } catch (e) {
      console.error('Failed to load thread/relation context:', e);
    } finally {
      setLoadingContext(false);
    }
  };

  const loadAllThreads = async () => {
    try {
      const list = await fetchJson<ThreadContext[]>('/api/threads');
      setAllThreads(list);
    } catch (e) {
      console.error('Failed to load threads:', e);
    }
  };

  const handleAddToThread = async (threadId: string) => {
    if (!node.id || !SAGA_ARC_LAYERS.includes(layer)) return;
    setAddingToThread(threadId);
    try {
      await fetchJson(`/api/threads/${threadId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: node.id, node_type: layer, role: 'primary' }),
      });
      await loadNodeContext();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error('Failed to add to thread:', e);
    } finally {
      setAddingToThread(null);
    }
  };

  const handleRemoveFromThread = async (membershipId: string, threadId: string) => {
    if (!node.id) return;
    setRemovingMembershipId(membershipId);
    try {
      await fetchJson(`/api/threads/${threadId}/members/${membershipId}`, { method: 'DELETE' });
      await loadNodeContext();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error('Failed to remove from thread:', e);
    } finally {
      setRemovingMembershipId(null);
    }
  };

  const loadRelationCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const [sagas, arcs] = await Promise.all([
        fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer_type: ['saga'] }) }),
        fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer_type: ['arc'] }) }),
      ]);
      const combined: Array<{ id: string; type: TimelineLayer; title: string }> = [
        ...(sagas.results ?? []).filter((n) => n.id !== node.id).map((n) => ({ id: n.id, type: 'saga' as TimelineLayer, title: n.title })),
        ...(arcs.results ?? []).filter((n) => n.id !== node.id).map((n) => ({ id: n.id, type: 'arc' as TimelineLayer, title: n.title })),
      ];
      setRelationCandidates(combined);
    } catch (e) {
      console.error('Failed to load relation candidates:', e);
      setRelationCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAddRelation = async () => {
    if (!node.id || !targetNode || !SAGA_ARC_LAYERS.includes(layer)) return;
    setAddingRelation(true);
    try {
      await fetchJson('/api/threads/node-relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_node_id: node.id,
          from_node_type: layer,
          to_node_id: targetNode.id,
          to_node_type: targetNode.type,
          relation_type: relationType,
        }),
      });
      await loadNodeContext();
      if (onUpdate) onUpdate();
      setShowAddRelation(false);
      setTargetNode(null);
    } catch (e) {
      console.error('Failed to add relation:', e);
    } finally {
      setAddingRelation(false);
    }
  };

  const layerColor = LAYER_COLORS[layer];
  const duration = node.end_date 
    ? `${formatDate(node.start_date)} - ${formatDate(node.end_date)}`
    : `Started ${formatDate(node.start_date)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-black via-purple-950/20 to-black border border-primary/30 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-border/60 bg-black/40">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: layerColor }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {layerLabels[layer]}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateTitle}
                  disabled={generatingTitle}
                  className="h-6 px-2 text-xs"
                >
                  {generatingTitle ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <h2 className="text-2xl font-bold text-white truncate">{node.title}</h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="flex-shrink-0 text-white/70 hover:text-white"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Date Range */}
          <Card className="bg-black/40 border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-white/80">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm">{duration}</span>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-black/40 border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold text-white">Summary</h3>
                {!summary && !loadingSummary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadSummary}
                    className="h-6 px-2 text-xs"
                  >
                    Generate Summary
                  </Button>
                )}
              </div>
              {loadingSummary ? (
                <div className="flex items-center gap-2 text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating summary...</span>
                </div>
              ) : summary ? (
                <p className="text-white/80 leading-relaxed whitespace-pre-wrap">{summary}</p>
              ) : (
                <p className="text-white/40 italic">No summary available. Click "Generate Summary" to create one.</p>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          {node.tags && node.tags.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-white">Tags</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {node.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Threads & Relations (saga/arc only) */}
          {SAGA_ARC_LAYERS.includes(layer) && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-white">Threads</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={loadAllThreads}
                  >
                    Add to thread
                  </Button>
                </div>
                {loadingContext ? (
                  <div className="flex items-center gap-2 text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading threads…</span>
                  </div>
                ) : nodeContext ? (
                  <>
                    <div className="flex flex-wrap gap-2 items-center">
                      {nodeContext.threads.map((t) => (
                        <Badge key={t.id ?? t.membership_id} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                          {t.name}
                          {t.membership_id && (
                            <button
                              type="button"
                              aria-label="Remove from thread"
                              className="rounded hover:bg-white/20 p-0.5"
                              disabled={!!removingMembershipId}
                              onClick={() => handleRemoveFromThread(t.membership_id!, t.id)}
                            >
                              {removingMembershipId === t.membership_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3 w-3" />}
                            </button>
                          )}
                        </Badge>
                      ))}
                      {nodeContext.threads.length === 0 && (
                        <span className="text-sm text-white/40">Not in any thread</span>
                      )}
                    </div>
                    {allThreads.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2 border-t border-white/10">
                        {allThreads
                          .filter((t) => !nodeContext.threads.some((ctx) => ctx.id === t.id))
                          .slice(0, 5)
                          .map((t) => (
                            <Button
                              key={t.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={addingToThread === t.id}
                              onClick={() => handleAddToThread(t.id)}
                            >
                              {addingToThread === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                              {t.name}
                            </Button>
                          ))}
                      </div>
                    )}
                  </>
                ) : null}

                <div className="flex items-center gap-2 pt-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-white">Relations</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setShowAddRelation(!showAddRelation);
                      if (!showAddRelation) loadRelationCandidates();
                    }}
                  >
                    Add relation
                  </Button>
                </div>
                {showAddRelation && (
                  <div className="rounded bg-black/40 border border-white/10 p-3 space-y-2">
                    <div className="flex gap-2 flex-wrap items-center">
                      <label className="text-sm text-white/70">Type</label>
                      <select
                        value={relationType}
                        onChange={(e) => setRelationType(e.target.value)}
                        className="rounded bg-black/60 border border-white/20 text-white text-sm px-2 py-1"
                      >
                        {RELATION_TYPES.map((rt) => (
                          <option key={rt} value={rt}>
                            {rt.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <label className="text-sm text-white/70">Target</label>
                      <select
                        value={targetNode ? `${targetNode.type}:${targetNode.id}` : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) setTargetNode(null);
                          else {
                            const [type, id] = v.split(':');
                            const c = relationCandidates.find((n) => n.id === id);
                            if (c) setTargetNode(c);
                          }
                        }}
                        disabled={loadingCandidates}
                        className="rounded bg-black/60 border border-white/20 text-white text-sm px-2 py-1 min-w-[180px]"
                      >
                        <option value="">Select node…</option>
                        {relationCandidates.map((c) => (
                          <option key={c.id} value={`${c.type}:${c.id}`}>
                            [{c.type}] {c.title}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" disabled={!targetNode || addingRelation} onClick={handleAddRelation}>
                        {addingRelation ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                      </Button>
                    </div>
                  </div>
                )}
                {nodeContext?.relations && nodeContext.relations.length > 0 ? (
                  <ul className="text-sm text-white/80 space-y-1">
                    {nodeContext.relations.map((r, i) => (
                      <li key={i}>
                        {r.relation_type.replace(/_/g, ' ')}: {r.other_node.title || r.other_node.id.slice(0, 8)}
                      </li>
                    ))}
                  </ul>
                ) : !showAddRelation && (
                  <span className="text-sm text-white/40">No relations</span>
                )}
              </CardContent>
            </Card>
          )}

          {/* Children */}
          {children.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-white">
                    Contains {children.length} {children.length === 1 ? 'child' : 'children'}
                  </h3>
                </div>
                {loadingChildren ? (
                  <div className="flex items-center gap-2 text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {children.slice(0, 10).map((child) => (
                      <div
                        key={child.id}
                        className="p-3 rounded bg-black/40 border border-border/30 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: LAYER_COLORS[layer] }}
                          />
                          <span className="font-medium text-white">{child.title}</span>
                        </div>
                        {child.description && (
                          <p className="text-sm text-white/60 line-clamp-2">{child.description}</p>
                        )}
                        <div className="text-xs text-white/40 mt-1">
                          {formatDate(child.start_date)}
                          {child.end_date && ` - ${formatDate(child.end_date)}`}
                        </div>
                      </div>
                    ))}
                    {children.length > 10 && (
                      <p className="text-sm text-white/40 text-center pt-2">
                        ...and {children.length - 10} more
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          {node.metadata && Object.keys(node.metadata).length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-white">Metadata</h3>
                </div>
                <pre className="text-xs text-white/60 bg-black/40 p-3 rounded overflow-x-auto">
                  {JSON.stringify(node.metadata, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-border/60 bg-black/40">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

