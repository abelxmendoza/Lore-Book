import { useNavigate } from 'react-router-dom';
import type { CertifiedEntityType, CharacterVariant } from '../../../types/certifiedEntity';
import {
  getLoreEntity,
  loreKindForChip,
  routeForLoreKind,
  type LoreEntityKind,
} from '../../../lib/loreEntities';
import { displayChipName } from '../../../lib/selfChipLabel';
import { CompactEntityChip, CompactChipStrip } from '../components/CompactEntityChip';

export interface EntityChip {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  loreKind?: LoreEntityKind;
  confidence?: number;
  provenance?: 'character_book' | 'location_book' | 'organization_book' | 'omega_entity';
  mentionStatus?: 'confirmed' | 'mentioned_only';
}

interface EntityChipsRowProps {
  entities: EntityChip[];
  label?: string;
  max?: number;
  mode?: 'navigate' | 'focus';
  selectedId?: string | null;
  onSelect?: (entity: EntityChip) => void;
}

const PROVENANCE_LABEL: Record<NonNullable<EntityChip['provenance']>, string> = {
  character_book: 'Character Book',
  location_book: 'Location Book',
  organization_book: 'Organizations',
  omega_entity: 'Detected (omega)',
};

function entityChipLabel(entity: EntityChip): string {
  // Sentence-bleed self labels ("And You") → "You (Firstname)" / "You".
  return displayChipName(entity.name);
}

function chipTitle(entity: EntityChip, mode: EntityChipsRowProps['mode'], selected: boolean): string {
  const label = entityChipLabel(entity);
  if (mode === 'focus') {
    return selected ? `Clear focus on ${label}` : `Focus next message on ${label}`;
  }
  const kind = loreKindForChip(entity);
  const def = getLoreEntity(kind);
  const parts = [`${label} (${def.label})`];
  if (entity.provenance) parts.push(`source: ${PROVENANCE_LABEL[entity.provenance]}`);
  if (entity.confidence != null) parts.push(`confidence: ${Math.round(entity.confidence * 100)}%`);
  if (entity.mentionStatus === 'mentioned_only') parts.push('status: detected, not yet confirmed');
  return parts.join(' · ');
}

function chipClasses(entity: EntityChip, tentative: boolean, selected: boolean): string {
  const base = getLoreEntity(loreKindForChip(entity)).chip;
  return [
    base,
    tentative ? 'border-dashed opacity-90' : '',
    selected ? 'ring-1 ring-primary/70 ring-offset-1 ring-offset-black/80' : '',
  ].join(' ');
}

export const EntityChipsRow = ({
  entities,
  label = 'detected:',
  max = 5,
  mode = 'navigate',
  selectedId = null,
  onSelect,
}: EntityChipsRowProps) => {
  const navigate = useNavigate();

  if (!entities || entities.length === 0) return null;

  const visible = entities.slice(0, max);
  const overflow = entities.length - visible.length;

  const handleClick = (entity: EntityChip) => {
    if (mode === 'focus') {
      onSelect?.(entity);
      return;
    }
    const route = routeForLoreKind(loreKindForChip(entity));
    if (!route) return;
    sessionStorage.setItem('highlightItem', entity.id);
    navigate(route);
  };

  return (
    <CompactChipStrip label={label.replace(/:$/, '')}>
      {visible.map((entity) => {
        const selected = mode === 'focus' && selectedId === entity.id;
        const tentative = entity.mentionStatus === 'mentioned_only' || entity.provenance === 'omega_entity';
        const kind = loreKindForChip(entity);
        const Icon = getLoreEntity(kind).icon;
        const route = routeForLoreKind(kind);

        return (
          <CompactEntityChip
            key={entity.id}
            title={chipTitle(entity, mode, selected)}
            className={chipClasses(entity, tentative, selected)}
            onClick={route || mode === 'focus' ? () => handleClick(entity) : undefined}
          >
            <Icon className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{entityChipLabel(entity)}</span>
            {tentative && <span className="text-[8px] opacity-60">?</span>}
          </CompactEntityChip>
        );
      })}
      {overflow > 0 && (
        <span className="text-[10px] text-white/30 shrink-0">+{overflow} more</span>
      )}
    </CompactChipStrip>
  );
};
