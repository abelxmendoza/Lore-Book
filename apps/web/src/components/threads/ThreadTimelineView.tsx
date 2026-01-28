/**
 * ThreadTimelineView — horizontal timeline for one thread (Omega1, Love life, etc.).
 * Uses GET /api/threads/:id/timeline; gaps between nodes are meaningful ("paused").
 * Optionally shows interruptions from GET /api/threads/:id/interruptions.
 */

import { useState, useEffect } from 'react';
import { GitBranch, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';

type ThreadNodeSnapshot = {
  node_id: string;
  node_type: string;
  thread_id: string;
  role: string | null;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

type InterruptionItem = {
  node: ThreadNodeSnapshot;
  overlappingNodes: Array<{ node_id: string; node_type: string; title: string; start_date: string; end_date: string | null }>;
};

type ThreadTimelineViewProps = {
  threadId: string;
  threadName?: string;
  onNodeClick?: (nodeId: string, nodeType: string) => void;
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const ThreadTimelineView = ({ threadId, threadName, onNodeClick }: ThreadTimelineViewProps) => {
  const [nodes, setNodes] = useState<ThreadNodeSnapshot[]>([]);
  const [interruptions, setInterruptions] = useState<InterruptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInterruptions, setShowInterruptions] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [timeline, interr] = await Promise.all([
          fetchJson<ThreadNodeSnapshot[]>(`/api/threads/${threadId}/timeline`),
          fetchJson<InterruptionItem[]>(`/api/threads/${threadId}/interruptions`),
        ]);
        setNodes(timeline ?? []);
        setInterruptions(interr ?? []);
      } catch (e) {
        console.error('Failed to load thread timeline:', e);
        setNodes([]);
        setInterruptions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [threadId]);

  if (loading) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-8 flex items-center justify-center gap-2 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading thread timeline…</span>
        </CardContent>
      </Card>
    );
  }

  if (nodes.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-8 flex flex-col items-center justify-center gap-2 text-white/60">
          <GitBranch className="h-8 w-8 text-white/30" />
          <span>{threadName ? `No nodes in "${threadName}" yet` : 'No nodes in this thread yet'}</span>
        </CardContent>
      </Card>
    );
  }

  const minDate = nodes.reduce((a, n) => (n.start_date < a ? n.start_date : a), nodes[0]?.start_date ?? '');
  const maxDate = nodes.reduce((a, n) => {
    const e = n.end_date ?? n.start_date;
    return e > a ? e : a;
  }, nodes[0]?.end_date ?? nodes[0]?.start_date ?? '');
  const totalMs = new Date(maxDate).getTime() - new Date(minDate).getTime();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-white">{threadName ?? 'Thread'}</h3>
          <Badge variant="outline" className="text-xs">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={showInterruptions}
            onChange={(e) => setShowInterruptions(e.target.checked)}
            className="rounded border-white/30"
          />
          Show interruptions
        </label>
      </div>

      <Card className="bg-black/40 border-border/60 overflow-hidden">
        <CardContent className="p-4 overflow-x-auto">
          <div className="relative min-w-[600px]" style={{ paddingLeft: 8, paddingRight: 8 }}>
            {/* Time axis hint */}
            <div className="text-xs text-white/40 mb-2">
              {formatDate(minDate)} → {formatDate(maxDate)}
            </div>
            <div className="flex gap-1 items-stretch" style={{ minHeight: 56 }}>
              {nodes.map((node, i) => {
                const startMs = new Date(node.start_date).getTime() - new Date(minDate).getTime();
                const endMs = (node.end_date ? new Date(node.end_date) : new Date(node.start_date)).getTime() - new Date(minDate).getTime();
                const widthPct = totalMs > 0 ? Math.max(8, ((endMs - startMs) / totalMs) * 100) : 10;
                const marginLeftPct = totalMs > 0 ? (startMs / totalMs) * 100 : 0;
                const interr = showInterruptions ? interruptions.find((x) => x.node.node_id === node.node_id) : null;
                return (
                  <div key={node.node_id} className="flex flex-col gap-1 flex-shrink-0" style={{ width: `${widthPct}%`, marginLeft: i === 0 ? 0 : '2%' }}>
                    <button
                      type="button"
                      onClick={() => onNodeClick?.(node.node_id, node.node_type)}
                      className="text-left p-2 rounded bg-primary/20 border border-primary/40 hover:bg-primary/30 text-white truncate"
                      title={node.title}
                    >
                      <span className="font-medium truncate block">{node.title}</span>
                      <span className="text-xs text-white/60">
                        {formatDate(node.start_date)}
                        {node.end_date ? ` – ${formatDate(node.end_date)}` : ''}
                      </span>
                    </button>
                    {interr && interr.overlappingNodes.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-white/50" title={interr.overlappingNodes.map((o) => o.title).join(', ')}>
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{interr.overlappingNodes.length} overlapping</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {showInterruptions && interruptions.some((i) => i.overlappingNodes.length > 0) && (
        <Card className="bg-black/40 border-border/60">
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold text-white mb-2">Interruptions (what was going on when this thread paused)</h4>
            <ul className="space-y-2 text-sm text-white/80">
              {interruptions
                .filter((i) => i.overlappingNodes.length > 0)
                .map((item, idx) => (
                  <li key={idx}>
                    <span className="text-white/60">{item.node.title}:</span>{' '}
                    {item.overlappingNodes.map((o) => o.title).join(', ')}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
