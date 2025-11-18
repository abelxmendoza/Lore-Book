/**
 * Create Node Modal
 * Modal for creating new timeline nodes with auto-classification
 */

import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { TimelineLayer, LAYER_COLORS } from '../../types/timeline';
import { useTimelineHierarchy } from '../../hooks/useTimelineHierarchy';

type CreateNodeModalProps = {
  layer: TimelineLayer;
  parentId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

export const CreateNodeModal = ({
  layer,
  parentId,
  onClose,
  onCreated
}: CreateNodeModalProps) => {
  const { createNode, autoClassify } = useTimelineHierarchy();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedLayer, setSuggestedLayer] = useState<TimelineLayer | null>(null);
  const [classifying, setClassifying] = useState(false);

  const layerColor = LAYER_COLORS[layer];

  const handleAutoClassify = async () => {
    if (!title.trim() && !description.trim()) return;

    setClassifying(true);
    try {
      const result = await autoClassify(
        `${title} ${description}`.trim(),
        new Date().toISOString()
      );
      setSuggestedLayer(result.layer);
    } catch (error) {
      console.error('Auto-classification failed:', error);
    } finally {
      setClassifying(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await createNode(layer, {
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
        tags,
        parent_id: parentId || null
      });
      onCreated();
    } catch (error) {
      console.error('Failed to create node:', error);
      alert('Failed to create node. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl bg-black/95 border-border/60"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: layerColor }}
              />
              <CardTitle className="text-white capitalize">
                Create New {layer}
              </CardTitle>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Auto-classification Suggestion */}
            {suggestedLayer && suggestedLayer !== layer && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-white">
                    AI Suggestion
                  </span>
                </div>
                <p className="text-xs text-white/70">
                  This might be better classified as a{' '}
                  <Badge
                    variant="outline"
                    className="text-xs capitalize"
                    style={{
                      borderColor: `${LAYER_COLORS[suggestedLayer]}66`,
                      color: LAYER_COLORS[suggestedLayer]
                    }}
                  >
                    {suggestedLayer}
                  </Badge>
                </p>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-white/80 mb-1 block">
                Title *
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Enter ${layer} title...`}
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
                placeholder={`Describe this ${layer}...`}
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
                  End Date (optional)
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
              <label className="text-sm font-medium text-white/80 mb-1 block">
                Tags
              </label>
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
                <Button
                  type="button"
                  onClick={handleAddTag}
                  variant="outline"
                >
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

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleAutoClassify}
                disabled={classifying || (!title.trim() && !description.trim())}
              >
                {classifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Classify
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !title.trim()}
                  style={{ backgroundColor: layerColor }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

