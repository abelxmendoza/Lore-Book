import { BrainCircuit } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const ChatPanel = ({
  answer,
  loading,
  persona,
  onPersonaChange,
  onRefresh
}: {
  answer: string;
  loading: boolean;
  persona: string;
  onPersonaChange: (value: string) => void;
  onRefresh: () => void;
}) => (
  <Card className="h-full">
    <CardHeader className="items-center justify-between gap-3">
      <CardTitle className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-primary" /> Ask Lore Keeper
      </CardTitle>
      <div className="flex items-center gap-2 text-xs text-white/60">
        <select
          value={persona}
          onChange={(event) => onPersonaChange(event.target.value)}
          className="rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-xs text-white"
        >
          <option>The Archivist</option>
          <option>The Confidante</option>
          <option>Angel Negro</option>
        </select>
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-white/80">
        {loading && 'Synthesizing memory...'}
        {!loading && answer && answer}
        {!loading && !answer && 'Ask a question to see summaries that reference your stored memories.'}
      </p>
    </CardContent>
  </Card>
);
