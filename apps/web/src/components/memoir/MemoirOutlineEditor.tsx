import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, ChevronRight, ChevronDown, Edit2, Save, X, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';

type OutlineNode = {
  id: string;
  title: string;
  order: number;
  parentId?: string;
  children?: OutlineNode[];
  expanded?: boolean;
  editing?: boolean;
};

type MemoirOutlineEditorProps = {
  sections: Array<{
    id: string;
    title: string;
    order: number;
    parentId?: string;
    children?: any[];
  }>;
  onSectionSelect: (sectionId: string) => void;
  onSectionAdd: (parentId?: string) => void;
  onSectionDelete: (sectionId: string) => void;
  onSectionUpdate: (sectionId: string, title: string) => void;
  onSectionReorder: (sectionId: string, newOrder: number, newParentId?: string) => void;
  selectedSectionId?: string;
};

export const MemoirOutlineEditor = ({
  sections,
  onSectionSelect,
  onSectionAdd,
  onSectionDelete,
  onSectionUpdate,
  onSectionReorder,
  selectedSectionId
}: MemoirOutlineEditorProps) => {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Convert sections to outline nodes
    const buildNodes = (items: any[], parentId?: string): OutlineNode[] => {
      return items
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map(item => ({
          id: item.id,
          title: item.title,
          order: item.order,
          parentId: item.parentId,
          children: buildNodes(items, item.id),
          expanded: expandedIds.has(item.id)
        }));
    };
    setNodes(buildNodes(sections));
  }, [sections, expandedIds]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEdit = (node: OutlineNode) => {
    setEditingId(node.id);
    setEditValue(node.title);
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      onSectionUpdate(editingId, editValue.trim());
      setEditingId(null);
      setEditValue('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const renderNode = (node: OutlineNode, depth = 0): JSX.Element => {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedSectionId === node.id;
    const isEditing = editingId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`
            group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
            ${isSelected ? 'bg-primary/20 border border-primary/50' : 'hover:bg-black/40'}
          `}
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
          onClick={() => !isEditing && onSectionSelect(node.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="text-white/40 hover:text-white"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          
          <GripVertical className="h-4 w-4 text-white/20 group-hover:text-white/40" />
          
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                className="flex-1 bg-black/60 border-border/50 text-white text-sm h-7"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <Button size="sm" variant="ghost" onClick={saveEdit}>
                <Save className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-sm text-white/90">{node.title}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(node);
                  }}
                  className="h-6 w-6 p-0"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSectionAdd(node.id);
                  }}
                  className="h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this section?')) {
                      onSectionDelete(node.id);
                    }
                  }}
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div className="ml-4 border-l border-border/20">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="bg-black/40 border-border/60 h-full flex flex-col">
      <CardContent className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Outline Editor
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSectionAdd()}
            leftIcon={<Plus className="h-3 w-3" />}
          >
            Add Section
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {nodes.length === 0 ? (
            <div className="text-center py-8 text-white/50 text-sm">
              <p>No sections yet</p>
              <p className="text-xs mt-1">Click "Add Section" to start</p>
            </div>
          ) : (
            nodes.map(node => renderNode(node))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

