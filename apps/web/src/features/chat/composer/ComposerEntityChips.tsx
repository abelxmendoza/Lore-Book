import {
  Users, MapPin, Building2, Zap, Calendar, Heart, X, Loader2,
} from 'lucide-react';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import {
  chipColorForEntity,
  ENTITY_VISUAL_LABELS,
  visualKindForEntity,
  type EntityVisualKind,
} from '../../../lib/entityTypeColors';
import { composerMatchSlot } from '../../../store/slices/composerSlice';
import { CompactEntityChip, CompactChipStrip } from '../components/CompactEntityChip';

type ComposerEntityChipsProps = {
  entities: CertifiedEntityMatch[];
  confirmingSlots?: string[];
  onDismiss?: (entity: CertifiedEntityMatch) => void;
  onConfirm?: (entity: CertifiedEntityMatch) => void;
};

const ICONS: Record<EntityVisualKind, React.ComponentType<{ className?: string }>> = {
  character: Users,
  romantic: Heart,
  location: MapPin,
  group: Building2,
  skill: Zap,
  event: Calendar,
};

function chipTitle(entity: CertifiedEntityMatch): string {
  const kind = entity.matchKind === 'prefix' ? 'autocomplete' : 'mentioned';
  const visual = visualKindForEntity(entity);
  const status =
    entity.status === 'draft'
      ? 'new — tap to add'
      : entity.status === 'suggestion'
        ? 'detected — tap to confirm'
        : 'in context';
  return `${entity.name} (${ENTITY_VISUAL_LABELS[visual]}, ${status}) — ${kind}`;
}

function isConfirmable(entity: CertifiedEntityMatch): boolean {
  return entity.status === 'suggestion' || entity.status === 'draft';
}

/**
 * Single compact row of entity chips above the chat input.
 */
export const ComposerEntityChips = ({
  entities,
  confirmingSlots = [],
  onDismiss,
  onConfirm,
}: ComposerEntityChipsProps) => {
  if (entities.length === 0) return null;

  const needsConfirm = entities.some(isConfirmable);

  return (
    <div
      data-testid="composer-entity-chips"
      className="border-b border-white/[0.04] bg-black/25 px-3 py-0.5 sm:px-4 lg:px-10 xl:px-12"
    >
      <div className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
        <CompactChipStrip label={needsConfirm ? 'Detected — tap to confirm' : 'Known in LoreBook'}>
          {entities.map((entity) => {
            const visual = visualKindForEntity(entity);
            const Icon = ICONS[visual];
            const slot = composerMatchSlot(entity);
            const confirming = confirmingSlots.includes(slot);
            const canConfirm = isConfirmable(entity) && onConfirm;

            return (
              <span key={slot} className="inline-flex shrink-0 items-center">
                <CompactEntityChip
                  data-testid={`composer-entity-chip-${entity.type}-${entity.id}`}
                  title={chipTitle(entity)}
                  className={chipColorForEntity(entity)}
                  onClick={canConfirm ? () => onConfirm(entity) : undefined}
                  disabled={confirming}
                  aria-label={canConfirm ? `Confirm ${entity.name}` : undefined}
                >
                  <Icon className="h-2 w-2 flex-shrink-0 opacity-75" />
                  <span className="truncate">{entity.name}</span>
                  {entity.matchKind === 'prefix' && !confirming && (
                    <span className="text-[7px] opacity-45">…</span>
                  )}
                  {confirming && <Loader2 className="h-2 w-2 animate-spin opacity-80" />}
                </CompactEntityChip>
                {onDismiss && (
                  <button
                    type="button"
                    data-testid={`composer-entity-dismiss-${entity.type}-${entity.id}`}
                    className="-ml-0.5 rounded-full p-px text-white/30 hover:text-white/55 touch-manipulation"
                    aria-label={`Dismiss ${entity.name}`}
                    onClick={() => onDismiss(entity)}
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </span>
            );
          })}
        </CompactChipStrip>
      </div>
    </div>
  );
};
