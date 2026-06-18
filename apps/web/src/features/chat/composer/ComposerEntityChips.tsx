import { Users, MapPin, Building2, Zap, Calendar, Database, Sparkles, X } from 'lucide-react';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CertifiedEntityType } from '../../../types/certifiedEntity';

type ComposerEntityChipsProps = {
  entities: CertifiedEntityMatch[];
  onDismiss?: (entity: CertifiedEntityMatch) => void;
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

const SUGGESTION_COLOR =
  'border-amber-500/40 bg-amber-500/10 text-amber-200/90 border-dashed';

function chipTitle(entity: CertifiedEntityMatch): string {
  const kind = entity.matchKind === 'prefix' ? 'autocomplete match' : 'mentioned in draft';
  const status = entity.status === 'suggestion' ? 'pending review' : 'confirmed book entity';
  return `${entity.name} (${CONFIG[entity.type].label}, ${status}) — ${kind} — id ${entity.id.slice(0, 8)}…`;
}

/**
 * Surfaces book entities (confirmed + pending suggestions) detected while typing.
 * Each chip maps to a stable id loaded into the chat pipeline.
 */
export const ComposerEntityChips = ({ entities, onDismiss }: ComposerEntityChipsProps) => {
  if (entities.length === 0) return null;

  const confirmed = entities.filter((e) => e.status !== 'suggestion');
  const suggested = entities.filter((e) => e.status === 'suggestion');

  const renderChip = (entity: CertifiedEntityMatch, colorClass: string) => {
    const { icon: Icon } = CONFIG[entity.type];
    const slot = `${entity.type}-${entity.id}`;
    return (
      <span
        key={slot}
        data-testid={`composer-entity-chip-${entity.type}-${entity.id}`}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${colorClass}`}
        title={chipTitle(entity)}
      >
        <Icon className="h-3 w-3 flex-shrink-0 opacity-80" />
        <span className="truncate max-w-[140px]">{entity.name}</span>
        {entity.matchKind === 'prefix' && <span className="text-[9px] opacity-60">…</span>}
        {onDismiss && (
          <button
            type="button"
            data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
            className="ml-0.5 rounded-full p-0.5 hover:bg-white/10"
            aria-label={`Dismiss ${entity.name}`}
            onClick={() => onDismiss(entity)}
          >
            <X className="h-3 w-3 opacity-70" />
          </button>
        )}
      </span>
    );
  };

  return (
    <div
      data-testid="composer-entity-chips"
      className="px-3 sm:px-4 lg:px-10 xl:px-12 pt-2 pb-1 border-b border-white/5 bg-black/30"
    >
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
        {confirmed.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Database className="h-3 w-3 text-primary/70 flex-shrink-0" />
              <span className="text-[11px] text-white/50">
                Knowledge base loading for {confirmed.length} confirmed{' '}
                {confirmed.length === 1 ? 'entity' : 'entities'}:
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {confirmed.map((entity) => {
                const { color } = CONFIG[entity.type];
                return renderChip(entity, color);
              })}
            </div>
          </>
        )}

        {suggested.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
              <span className="text-[11px] text-white/45">
                {suggested.length} detected {suggested.length === 1 ? 'entity' : 'entities'} (pending review):
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((entity) => renderChip(entity, SUGGESTION_COLOR))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
