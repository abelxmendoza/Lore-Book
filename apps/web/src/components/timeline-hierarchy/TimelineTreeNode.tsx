/**
 * Timeline Tree Node Component
 * Recursive component for displaying timeline hierarchy tree
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TimelineNode, TimelineLayer, LAYER_COLORS, PARENT_LAYER_MAP } from '../../types/timeline';
import { useTimelineHierarchy } from '../../hooks/useTimelineHierarchy';

type TimelineTreeNodeProps = {
  node: TimelineNode;
  layer: TimelineLayer;
  depth?: number;
  onNodeClick: (nodeId: string, layer: TimelineLayer) => void;
  onCreateChild: (layer: TimelineLayer) => void;
};

const getChildLayer = (layer: TimelineLayer): TimelineLayer | null => {
  const hierarchy: Record<TimelineLayer, TimelineLayer | null> = {
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
  return hierarchy[layer] || null;
};

export const TimelineTreeNode = ({
  node,
  layer,
  depth = 0,
  onNodeClick,
  onCreateChild
}: TimelineTreeNodeProps) => {
  const [expanded, setExpanded] = useState(depth < 2); // Auto-expand first 2 levels
  const [children, setChildren] = useState<TimelineNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const { getChildren } = useTimelineHierarchy();

  const childLayer = getChildLayer(layer);
  const layerColor = LAYER_COLORS[layer];
  const hasChildren = childLayer !== null;

  const loadChildren = async () => {
    if (!hasChildren || children.length > 0) return;
    
    setLoadingChildren(true);
    try {
      const childNodes = await getChildren(layer, node.id);
      setChildren(childNodes);
    } catch (error) {
      console.error('Failed to load children:', error);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleToggle = () => {
    if (!hasChildren) return;
    if (!expanded) {
      loadChildren();
    }
    setExpanded(!expanded);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="select-none">
      {/* Node */}
      <div
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-black/40 transition-colors cursor-pointer group ${
          depth > 0 ? 'ml-4' : ''
        }`}
        style={{
          borderLeft: depth > 0 ? `2px solid ${layerColor}66` : 'none',
          paddingLeft: depth > 0 ? '12px' : '8px'
        }}
        onClick={() => onNodeClick(node.id, layer)}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className="p-1 hover:bg-black/60 rounded transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-white/60" />
            ) : (
              <ChevronRight className="h-4 w-4 text-white/60" />
            )}
          </button>
        ) : (
          <div className="w-6" /> // Spacer
        )}

        {/* Layer Color Indicator */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: layerColor }}
        />

        {/* Node Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium text-white truncate"
              style={{ color: layerColor }}
            >
              {node.title}
            </span>
            <Badge
              variant="outline"
              className="text-xs capitalize"
              style={{
                borderColor: `${layerColor}66`,
                color: layerColor
              }}
            >
              {layer}
            </Badge>
            {node.end_date && (
              <Badge variant="outline" className="text-xs text-white/40">
                Closed
              </Badge>
            )}
          </div>
          {node.description && (
            <p className="text-xs text-white/60 mt-1 line-clamp-1">
              {node.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
            <span>{formatDate(node.start_date)}</span>
            {node.end_date && (
              <>
                <span>→</span>
                <span>{formatDate(node.end_date)}</span>
              </>
            )}
            {node.tags.length > 0 && (
              <>
                <span>•</span>
                <span>{node.tags.length} tag{node.tags.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCreateChild(childLayer!);
              }}
              className="h-7 px-2 text-xs"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="ml-4 mt-1 space-y-1">
          {loadingChildren ? (
            <div className="text-xs text-white/40 p-2">Loading...</div>
          ) : children.length > 0 ? (
            children.map((child) => (
              <TimelineTreeNode
                key={child.id}
                node={child}
                layer={childLayer!}
                depth={depth + 1}
                onNodeClick={onNodeClick}
                onCreateChild={onCreateChild}
              />
            ))
          ) : (
            <div className="text-xs text-white/40 p-2">
              No {childLayer} children yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};

