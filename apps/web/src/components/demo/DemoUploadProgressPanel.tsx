import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type DemoUploadStage = {
  label: string;
  durationMs: number;
};

export type DemoUploadProgress = {
  stageIndex: number;
  stageLabel: string;
  percent: number;
};

type DemoUploadProgressPanelProps = {
  progress: DemoUploadProgress;
  stages: DemoUploadStage[];
  icon: LucideIcon;
  compact?: boolean;
};

export function DemoUploadProgressPanel({
  progress,
  stages,
  icon: Icon,
  compact,
}: DemoUploadProgressPanelProps) {
  return (
    <div className={`w-full ${compact ? 'space-y-2' : 'space-y-3'}`}>
      <div className="flex items-center gap-2">
        <Icon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-primary animate-pulse`} />
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-white`}>
          {progress.stageLabel}
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/70 via-primary to-cyan-400 transition-all duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className={`flex flex-wrap gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        {stages.map((stage, index) => {
          const done = index < progress.stageIndex;
          const active = index === progress.stageIndex;
          return (
            <span
              key={stage.label}
              className={`rounded-full px-2 py-0.5 transition-all duration-300 ${
                done
                  ? 'bg-primary/20 text-primary scale-100'
                  : active
                    ? 'bg-primary/30 text-white animate-pulse scale-105'
                    : 'bg-white/5 text-white/40 scale-100'
              }`}
            >
              {done ? '✓ ' : active ? '● ' : ''}
              {stage.label.replace('…', '')}
            </span>
          );
        })}
      </div>
    </div>
  );
}
