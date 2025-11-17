import { useState, useMemo, useRef } from 'react';
import { Calendar, Edit2, Sparkles } from 'lucide-react';
import type { TimelineResponse } from '../../hooks/useLoreKeeper';
import { Button } from '../ui/button';

type TimelineGraphProps = {
  timeline: TimelineResponse;
  onEditChapter?: (chapterId: string, newTitle: string) => Promise<void>;
  onEditSaga?: (sagaId: string, newTitle: string) => Promise<void>;
};

type TimelineNode = {
  id: string;
  type: 'chapter' | 'entry' | 'saga';
  title: string;
  date: Date;
  endDate?: Date;
  color: string;
  level: number;
  parentId?: string;
};

export const TimelineGraph = ({ timeline, onEditChapter, onEditSaga }: TimelineGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const nodes = useMemo(() => {
    const allNodes: TimelineNode[] = [];
    let chapterLevel = 0;
    let entryLevel = 0;

    // Process chapters
    timeline.chapters.forEach((chapter) => {
      const startDate = new Date(chapter.start_date);
      const endDate = chapter.end_date ? new Date(chapter.end_date) : new Date();
      
      allNodes.push({
        id: chapter.id,
        type: 'chapter',
        title: chapter.title,
        date: startDate,
        endDate: endDate,
        color: '#8b5cf6', // purple
        level: chapterLevel++
      });

      // Add entries within chapters
      chapter.months.forEach((month) => {
        month.entries.forEach((entry) => {
          allNodes.push({
            id: entry.id,
            type: 'entry',
            title: entry.summary || entry.content?.substring(0, 50) || 'Untitled',
            date: new Date(entry.date),
            color: '#06b6d4', // cyan
            level: chapterLevel,
            parentId: chapter.id
          });
        });
      });
    });

    // Add unassigned entries
    timeline.unassigned.forEach((group) => {
      group.entries.forEach((entry) => {
        allNodes.push({
          id: entry.id,
          type: 'entry',
          title: entry.summary || entry.content?.substring(0, 50) || 'Untitled',
          date: new Date(entry.date),
          color: '#64748b', // gray
          level: chapterLevel + entryLevel++
        });
      });
    });

    return allNodes.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [timeline]);

  const minDate = useMemo(() => {
    if (nodes.length === 0) return new Date();
    return new Date(Math.min(...nodes.map(n => n.date.getTime())));
  }, [nodes]);

  const maxDate = useMemo(() => {
    if (nodes.length === 0) return new Date();
    const dates = nodes.map(n => n.endDate?.getTime() || n.date.getTime());
    return new Date(Math.max(...dates));
  }, [nodes]);

  const totalDays = useMemo(() => {
    return Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  }, [minDate, maxDate]);

  const getPosition = (date: Date) => {
    const daysSinceStart = (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return (daysSinceStart / totalDays) * 100;
  };

  const getWidth = (startDate: Date, endDate?: Date) => {
    if (!endDate) return 2; // Single point
    const days = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(2, (days / totalDays) * 100);
  };

  const handleEdit = (node: TimelineNode) => {
    setEditingId(node.id);
    setEditValue(node.title);
  };

  const handleSave = async (node: TimelineNode) => {
    if (node.type === 'chapter' && onEditChapter) {
      await onEditChapter(node.id, editValue);
    } else if (node.type === 'saga' && onEditSaga) {
      await onEditSaga(node.id, editValue);
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-white/60">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-white/20" />
        <p className="text-lg font-medium mb-2">No timeline data yet</p>
        <p className="text-sm">Start chatting to build your timeline</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-auto" ref={containerRef}>
      <div className="relative min-w-full" style={{ height: `${Math.max(400, nodes.length * 60)}px` }}>
        {/* Time axis */}
        <div className="sticky top-0 z-10 bg-black/80 border-b border-border/60 pb-2 mb-4">
          <div className="relative h-8">
            {[0, 25, 50, 75, 100].map((percent) => {
              const date = new Date(minDate.getTime() + (percent / 100) * totalDays * 24 * 60 * 60 * 1000);
              return (
                <div
                  key={percent}
                  className="absolute top-0 border-l border-white/20 h-full"
                  style={{ left: `${percent}%` }}
                >
                  <div className="absolute -top-6 left-0 transform -translate-x-1/2 text-xs text-white/60 whitespace-nowrap">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline nodes */}
        <div className="relative space-y-2">
          {nodes.map((node, index) => {
            const left = getPosition(node.date);
            const width = node.endDate ? getWidth(node.date, node.endDate) : 2;
            const top = index * 60 + 20;

            return (
              <div
                key={node.id}
                className="absolute group"
                style={{
                  left: `${left}%`,
                  top: `${top}px`,
                  width: node.endDate ? `${width}%` : '2px',
                  minWidth: node.endDate ? '40px' : '2px'
                }}
              >
                <div
                  className={`relative rounded-lg border-2 transition-all hover:scale-105 ${
                    node.type === 'chapter'
                      ? 'bg-purple-500/20 border-purple-500/50 h-12'
                      : node.type === 'saga'
                      ? 'bg-amber-500/20 border-amber-500/50 h-10'
                      : 'bg-cyan-500/20 border-cyan-500/50 h-8'
                  }`}
                  style={{ backgroundColor: `${node.color}20`, borderColor: `${node.color}50` }}
                >
                  <div className="flex items-center h-full px-3 gap-2">
                    {node.type === 'chapter' && <Sparkles className="h-3 w-3 text-purple-400" />}
                    {editingId === node.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(node);
                            if (e.key === 'Escape') handleCancel();
                          }}
                          className="flex-1 bg-black/60 border border-primary/50 rounded px-2 py-1 text-xs text-white"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleSave(node)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancel}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-medium text-white truncate flex-1">
                          {node.title}
                        </span>
                        {(node.type === 'chapter' || node.type === 'saga') && (
                          <button
                            onClick={() => handleEdit(node)}
                            className="opacity-0 group-hover:opacity-100 transition"
                          >
                            <Edit2 className="h-3 w-3 text-white/60 hover:text-white" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {node.endDate && (
                    <div className="absolute -bottom-4 left-0 text-xs text-white/40">
                      {node.date.toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection lines */}
        <svg className="absolute inset-0 pointer-events-none" style={{ height: '100%', width: '100%' }}>
          {nodes
            .filter((node) => node.parentId)
            .map((node) => {
              const parent = nodes.find((n) => n.id === node.parentId);
              if (!parent) return null;
              const parentLeft = getPosition(parent.date);
              const parentTop = nodes.findIndex((n) => n.id === parent.id) * 60 + 20 + 24;
              const childLeft = getPosition(node.date);
              const childTop = nodes.findIndex((n) => n.id === node.id) * 60 + 20 + 16;
              return (
                <line
                  key={`${parent.id}-${node.id}`}
                  x1={`${parentLeft}%`}
                  y1={parentTop}
                  x2={`${childLeft}%`}
                  y2={childTop}
                  stroke="rgba(139, 92, 246, 0.3)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              );
            })}
        </svg>
      </div>
    </div>
  );
};

