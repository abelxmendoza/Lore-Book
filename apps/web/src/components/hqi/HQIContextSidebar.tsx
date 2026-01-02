import { AlertTriangle, Link2, NotebookPen } from 'lucide-react';

import { Badge } from '../ui/badge';

export type HQIContextNode = {
  id: string;
  title: string;
  snippet: string;
  timestamp: string;
  tags: string[];
  characters: string[];
  motifs: string[];
};

export type HQIContextPayload = {
  node: HQIContextNode;
  neighbors: HQIContextNode[];
};

type Props = {
  context?: HQIContextPayload | null;
};

export const HQIContextSidebar = ({ context }: Props) => {
  if (!context) {
    return (
      <div className="rounded-2xl border border-border/60 bg-black/40 p-4 text-white/60">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          Select a result to view graph context.
        </div>
      </div>
    );
  }

  const { node, neighbors } = context;

  return (
    <div className="rounded-2xl border border-border/60 bg-black/40 p-4 text-white">
      <div className="flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-primary" />
        <div>
          <p className="text-[11px] uppercase text-white/50">Context</p>
          <h4 className="text-lg font-semibold text-white">{node.title}</h4>
        </div>
      </div>

      <p className="mt-2 text-sm text-white/70">{node.snippet}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[...node.tags, ...node.characters, ...node.motifs].map((tag) => (
          <Badge key={tag} variant="outline" className="border-border/50 text-white/80">
            {tag}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">{new Date(node.timestamp).toLocaleString()}</p>

      <div className="mt-4">
        <p className="text-[11px] uppercase text-white/50">Neighbors</p>
        {neighbors.length === 0 && <p className="text-sm text-white/60">No linked memories.</p>}
        <div className="mt-2 space-y-2">
          {neighbors.map((neighbor) => (
            <div key={neighbor.id} className="rounded-xl border border-border/50 bg-black/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-white">{neighbor.title}</p>
                </div>
                <Badge className="bg-primary/20 text-primary">{new Date(neighbor.timestamp).toLocaleDateString()}</Badge>
              </div>
              <p className="mt-1 text-xs text-white/60">{neighbor.snippet}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
