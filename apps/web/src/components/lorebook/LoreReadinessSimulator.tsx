import { FlaskConical, Database, BookOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  LORE_READINESS_COMPILED_OPTIONS,
  LORE_READINESS_PRESET_OPTIONS,
  type LoreReadinessCompiledMode,
  type LoreReadinessKnowledgePreset,
} from '../../mocks/loreReadiness';
import { useLoreReadinessSimulationOptional } from '../../contexts/LoreReadinessSimulationContext';

type LoreReadinessSimulatorProps = {
  className?: string;
  compact?: boolean;
};

/** Demo controls — switch knowledge presets and compiled-book states without backend. */
export const LoreReadinessSimulator = ({ className, compact }: LoreReadinessSimulatorProps) => {
  const sim = useLoreReadinessSimulationOptional();
  if (!sim?.showSimulator) return null;

  const {
    isSimulating,
    preset,
    compiledMode,
    setSimulationEnabled,
    setPreset,
    setCompiledMode,
  } = sim;

  return (
    <div
      className={cn(
        'rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-3',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="h-4 w-4 text-violet-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-violet-200">Demo simulation</p>
            {!compact && (
              <p className="text-[11px] text-white/40 mt-0.5">
                Switch UI states freely — no backend required
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSimulationEnabled(!isSimulating)}
          className={cn(
            'shrink-0 text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded-full border transition-colors',
            isSimulating
              ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
              : 'border-white/15 bg-white/5 text-white/45 hover:text-white/70'
          )}
        >
          {isSimulating ? 'Simulated' : 'Live API'}
        </button>
      </div>

      <div className={cn(!isSimulating && 'opacity-50 pointer-events-none')}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Database className="h-3 w-3 text-white/35" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/35">Knowledge</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LORE_READINESS_PRESET_OPTIONS.map((option) => (
            <PresetChip
              key={option.id}
              active={preset === option.id}
              label={option.label}
              title={option.description}
              onClick={() => setPreset(option.id as LoreReadinessKnowledgePreset)}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 mt-3 mb-1.5">
          <BookOpen className="h-3 w-3 text-white/35" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/35">Compiled books</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LORE_READINESS_COMPILED_OPTIONS.map((option) => (
            <PresetChip
              key={option.id}
              active={compiledMode === option.id}
              label={option.label}
              title={option.description}
              onClick={() => setCompiledMode(option.id as LoreReadinessCompiledMode)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

function PresetChip({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
        active
          ? 'border-violet-400/50 bg-violet-500/20 text-violet-100'
          : 'border-white/10 bg-black/20 text-white/55 hover:border-white/25 hover:text-white/80'
      )}
    >
      {label}
    </button>
  );
}
