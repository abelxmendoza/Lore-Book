import { Loader2, Play } from 'lucide-react';

import { Button } from './ui/button';

export const AgentRunButton = ({ running, onRun }: { running: boolean; onRun: () => Promise<void> }) => (
  <Button
    size="sm"
    disabled={running}
    onClick={onRun}
    leftIcon={running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
  >
    {running ? 'Running...' : 'Run'}
  </Button>
);
