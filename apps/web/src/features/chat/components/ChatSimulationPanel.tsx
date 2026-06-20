import { Play, Square, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn';
import type { ChatLifecycleRunState, ChatLifecycleScenario } from '../services/chatLifecycleSimulation';

type ChatSimulationPanelProps = {
  scenarios: ChatLifecycleScenario[];
  runState: ChatLifecycleRunState;
  onRun: (scenarioId: string) => void;
  onStop: () => void;
  className?: string;
};

export function ChatSimulationPanel({
  scenarios,
  runState,
  onRun,
  onStop,
  className,
}: ChatSimulationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn(
          'fixed bottom-20 left-3 z-50 flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-black/80 px-3 py-1.5 text-[10px] font-medium text-violet-200 shadow-lg backdrop-blur-md sm:bottom-4',
          className
        )}
        title="Open chat simulation panel"
      >
        <Sparkles className="h-3 w-3" />
        Sim
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed bottom-20 left-3 z-50 w-[min(100vw-1.5rem,18rem)] rounded-xl border border-violet-500/25 bg-black/85 shadow-2xl backdrop-blur-md sm:bottom-4',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-300" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">Chat simulation</p>
            <p className="text-[10px] text-white/40">Thread + message animations</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-white/40 hover:bg-white/8 hover:text-white/70"
            aria-label={expanded ? 'Collapse scenarios' : 'Expand scenarios'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded px-1.5 py-0.5 text-[10px] text-white/35 hover:bg-white/8 hover:text-white/60"
          >
            Hide
          </button>
        </div>
      </div>

      {runState.running && (
        <div className="border-b border-white/6 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-violet-200/90">
              Running <span className="font-medium">{runState.scenarioId}</span>
              {runState.stepLabel ? ` · ${runState.stepLabel}` : ''}
            </p>
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25"
            >
              <Square className="h-2.5 w-2.5" />
              Stop
            </button>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-violet-500/70 transition-all duration-300"
              style={{
                width: `${Math.min(100, ((runState.stepIndex + 1) / Math.max(1, scenarios.find((s) => s.id === runState.scenarioId)?.steps.length ?? 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {expanded && (
        <ul className="max-h-52 space-y-1 overflow-y-auto p-2">
          {scenarios.map((scenario) => (
            <li key={scenario.id}>
              <button
                type="button"
                disabled={runState.running}
                onClick={() => onRun(scenario.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                  runState.running
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-violet-500/10 active:bg-violet-500/15'
                )}
              >
                <Play className="mt-0.5 h-3 w-3 shrink-0 text-violet-300" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-white/90">{scenario.label}</span>
                  <span className="block text-[10px] leading-snug text-white/40">{scenario.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
