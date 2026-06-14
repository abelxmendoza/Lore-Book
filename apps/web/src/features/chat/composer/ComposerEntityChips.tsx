import { Users, MapPin, Building2, Zap, Calendar, Database } from 'lucide-react';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CertifiedEntityType } from '../../../types/certifiedEntity';

type ComposerEntityChipsProps = {
  entities: CertifiedEntityMatch[];
};

const CONFIG: Record<
  CertifiedEntityType,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  character: { icon: Users, color: 'border-violet-500/50 bg-violet-500/15 text-violet-200', label: 'character' },
  location: { icon: MapPin, color: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200', label: 'place' },
  organization: { icon: Building2, color: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200', label: 'group' },
  skill: { icon: Zap, color: 'border-sky-500/50 bg-sky-500/15 text-sky-200', label: 'skill' },
  event: { icon: Calendar, color: 'border-amber-500/50 bg-amber-500/15 text-amber-200', label: 'event' },
};

/**
 * Surfaces certified book entities detected in the composer — each chip maps
 * to a stable UUID whose knowledge base will load into the chat pipeline.
 */
export const ComposerEntityChips = ({ entities }: ComposerEntityChipsProps) => {
  if (entities.length === 0) return null;

  return (
    <div className="px-3 sm:px-4 lg:px-10 xl:px-12 pt-2 pb-1 border-b border-white/5 bg-black/30">
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Database className="h-3 w-3 text-primary/70 flex-shrink-0" />
          <span className="text-[11px] text-white/50">
            Knowledge base loading for {entities.length} certified{' '}
            {entities.length === 1 ? 'entity' : 'entities'}:
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entities.map((entity) => {
            const { icon: Icon, color } = CONFIG[entity.type];
            return (
              <span
                key={`${entity.type}-${entity.id}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${color}`}
                title={`${entity.name} (${entity.type}) — id ${entity.id.slice(0, 8)}…`}
              >
                <Icon className="h-3 w-3 flex-shrink-0 opacity-80" />
                <span className="truncate max-w-[140px]">{entity.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
