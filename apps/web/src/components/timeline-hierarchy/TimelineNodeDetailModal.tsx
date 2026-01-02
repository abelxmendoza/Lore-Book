import { useState, useEffect } from 'react';
import { X, Calendar, Tag, Sparkles, Layers, Clock, FileText, RefreshCw, Loader2, Edit2, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { TimelineLayer, TimelineNode, LAYER_COLORS } from '../../types/timeline';

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

export const TimelineNodeDetailModal = ({ node, layer, onClose, onUpdate }: TimelineNodeDetailModalProps) => {
  const [summary, setSummary] = useState<string | null>(node.description || null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [children, setChildren] = useState<TimelineNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(node.title);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    // Load summary if not present
    if (!summary && node.id) {
      loadSummary();
    }
    
    // Load children
    loadChildren();
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

