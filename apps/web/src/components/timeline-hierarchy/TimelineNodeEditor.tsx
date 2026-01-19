/**
 * Timeline Node Editor
 * Drawer/panel for editing timeline nodes
 */

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { TimelineLayer, LAYER_COLORS, TimelineNode } from '../../types/timeline';
import { useTimelineHierarchy } from '../../hooks/useTimelineHierarchy';

type TimelineNodeEditorProps = {
  nodeId: string;
  layer: TimelineLayer;
  onClose: () => void;
  onUpdated: () => void;
};

export const TimelineNodeEditor = ({
  nodeId,
  layer,
  onClose,
  onUpdated
}: TimelineNodeEditorProps) => {
  const { getNode, updateNode, deleteNode, autoAssignTags } = useTimelineHierarchy();
  const [node, setNode] = useState<TimelineNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [autoTagging, setAutoTagging] = useState(false);

  const layerColor = LAYER_COLORS[layer];

  useEffect(() => {
    loadNode();
  }, [nodeId, layer]);

  const loadNode = async () => {
    setLoading(true);
    try {
      const nodeData = await getNode(layer, nodeId);
      setNode(nodeData);
      setTitle(nodeData.title);
      setDescription(nodeData.description || '');
      setStartDate(nodeData.start_date.split('T')[0]);
      setEndDate(nodeData.end_date?.split('T')[0] || '');
      setTags(nodeData.tags || []);
    } catch (error) {
      console.error('Failed to load node:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!node) return;

    setSaving(true);
    try {
      await updateNode(layer, nodeId, {
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
        tags
      });
      onUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to update node:', error);
      alert('Failed to update node. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this node? This will also delete all children.')) {
      return;
    }

    try {
      await deleteNode(layer, nodeId);
      onUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to delete node:', error);
      alert('Failed to delete node. Please try again.');
    }
  };

  const handleAutoTags = async () => {
    setAutoTagging(true);
    try {
      const newTags = await autoAssignTags(layer, nodeId);
      setTags(newTags);
    } catch (error) {
      console.error('Failed to auto-assign tags:', error);
    } finally {
      setAutoTagging(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  if (loading) {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-black/95 border-l border-border/60 p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!node) {
    return null;
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-black/95 border-l border-border/60 shadow-2xl overflow-y-auto">
      <Card className="border-0 bg-transparent">
        <CardHeader className="border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: layerColor }}
              />
              <CardTitle className="text-white capitalize">
                Edit {layer}
              </CardTitle>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-white/80 mb-1 block">
              Title *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-black/40 border-border/50 text-white"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-white/80 mb-1 block">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-black/40 border-border/50 text-white min-h-[100px]"
              rows={4}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-white/80 mb-1 block">
                Start Date *
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-black/40 border-border/50 text-white"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-white/80 mb-1 block">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-black/40 border-border/50 text-white"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/80">
                Tags
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAutoTags}
                disabled={autoTagging}
                className="text-xs"
              >
                {autoTagging ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Auto-Tag
                  </>
                )}
              </Button>
            </div>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag..."
                className="bg-black/40 border-border/50 text-white"
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-xs cursor-pointer hover:bg-red-500/20"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div>
            <label className="text-sm font-medium text-white/80 mb-1 block">
              Source Type
            </label>
            <Badge variant="outline" className="text-xs">
              {node.source_type}
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              className="text-red-400 border-red-400/30 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              style={{ backgroundColor: layerColor }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

