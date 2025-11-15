import { BrainCircuit } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const ChatPanel = ({ answer, loading, onRefresh }: { answer: string; loading: boolean; onRefresh: () => void }) => (
  <Card className="h-full">
    <CardHeader className="items-center justify-between">
      <CardTitle className="flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-primary" /> Ask Lore Keeper
      </CardTitle>
      <Button size="sm" variant="ghost" onClick={onRefresh}>
        Refresh
      </Button>
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
