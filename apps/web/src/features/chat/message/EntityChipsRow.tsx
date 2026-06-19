import {
  Users, MapPin, Building2, Zap, Calendar, Heart,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CertifiedEntityType, CharacterVariant } from '../../../types/certifiedEntity';
import {
  chipColorForEntity,
  ENTITY_VISUAL_LABELS,
  visualKindForEntity,
  type EntityVisualKind,
} from '../../../lib/entityTypeColors';
import { CompactEntityChip, CompactChipStrip } from '../components/CompactEntityChip';

export interface EntityChip {
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
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

const ICONS: Record<EntityVisualKind, React.ComponentType<{ className?: string }>> = {
  character: Users,
  romantic: Heart,
  location: MapPin,
  group: Building2,
  skill: Zap,
  event: Calendar,
};

const ROUTE: Partial<Record<CertifiedEntityType, string>> = {
  character: '/characters',
  location: '/locations',
  organization: '/organizations',
  skill: '/skills',
  event: '/events',
};

const PROVENANCE_LABEL: Record<NonNullable<EntityChip['provenance']>, string> = {
  character_book: 'Character Book',
  location_book: 'Location Book',
  organization_book: 'Organizations',
  omega_entity: 'Detected (omega)',
};

function chipTitle(entity: EntityChip, mode: EntityChipsRowProps['mode'], selected: boolean): string {
  if (mode === 'focus') {
    return selected ? `Clear focus on ${entity.name}` : `Focus next message on ${entity.name}`;
  }
  const visual = visualKindForEntity(entity);
  const parts = [`${entity.name} (${ENTITY_VISUAL_LABELS[visual]})`];
  if (entity.provenance) parts.push(`source: ${PROVENANCE_LABEL[entity.provenance]}`);
  if (entity.confidence != null) parts.push(`confidence: ${Math.round(entity.confidence * 100)}%`);
  if (entity.mentionStatus === 'mentioned_only') parts.push('status: detected, not yet confirmed');
  return parts.join(' · ');
}

function chipClasses(entity: EntityChip, tentative: boolean, selected: boolean): string {
  const status =
    entity.mentionStatus === 'mentioned_only' || entity.provenance === 'omega_entity'
      ? 'suggestion'
      : 'confirmed';
  return [
    chipColorForEntity({ ...entity, status }),
    tentative ? 'opacity-90' : '',
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
    const route = ROUTE[entity.type];
    if (!route) return;
    sessionStorage.setItem('highlightItem', entity.id);
    navigate(route);
  };

  return (
    <CompactChipStrip label={label.replace(/:$/, '')}>
      {visible.map((entity) => {
        const selected = mode === 'focus' && selectedId === entity.id;
        const tentative = entity.mentionStatus === 'mentioned_only' || entity.provenance === 'omega_entity';
        const visual = visualKindForEntity(entity);
        const Icon = ICONS[visual];
        const route = ROUTE[entity.type];

        return (
          <CompactEntityChip
            key={entity.id}
            title={chipTitle(entity, mode, selected)}
            className={chipClasses(entity, tentative, selected)}
            onClick={route || mode === 'focus' ? () => handleClick(entity) : undefined}
          >
            <Icon className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate">{entity.name}</span>
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
