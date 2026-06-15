import { Users, MapPin, Building2, Zap, Calendar } from 'lucide-react';
import type { EntityType } from '../../../hooks/useEntityIndexer';

type Mood = {
  score: number;
  color: string;
  label: string;
};

type ComposerHintsProps = {
  mood: Mood;
  entities: Array<{ name: string; type: EntityType }>;
  tagCount: number;
};

const ENTITY_CONFIG: Record<EntityType, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  character: { icon: Users, color: 'text-violet-400' },
  location:  { icon: MapPin, color: 'text-emerald-400' },
  organization: { icon: Building2, color: 'text-amber-400' },
  skill:     { icon: Zap, color: 'text-sky-400' },
  event:     { icon: Calendar, color: 'text-orange-400' },
};

const MAX_PER_TYPE = 2;

export const ComposerHints = ({ mood, entities, tagCount }: ComposerHintsProps) => {
  // Group by type, cap per type
  const grouped = (['character', 'location', 'organization', 'skill', 'event'] as EntityType[]).reduce<
    Record<EntityType, Array<{ name: string; type: EntityType }>>
  >(
    (acc, type) => {
      acc[type] = entities.filter(e => e.type === type).slice(0, MAX_PER_TYPE);
      return acc;
    },
    { character: [], location: [], organization: [], skill: [], event: [] }
  );

  const hasEntities = entities.length > 0;

  return (
    <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {mood.score !== 0 && (
        <div className="flex items-center gap-1.5 text-white/50">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mood.color }} />
          <span>{mood.label}</span>
        </div>
      )}

      {hasEntities && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(['character', 'location', 'organization', 'skill', 'event'] as EntityType[]).map(type => {
            const matches = grouped[type];
            if (matches.length === 0) return null;
            const { icon: Icon, color } = ENTITY_CONFIG[type];
            return matches.map(match => (
              <span
                key={`${type}-${match.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/60"
              >
                <Icon className={`h-3 w-3 shrink-0 ${color}`} />
                <span className="truncate max-w-[120px]">{match.name}</span>
              </span>
            ));
          })}
        </div>
      )}

      {tagCount > 0 && (
        <span className="text-white/40">
          {tagCount} tag{tagCount > 1 ? 's' : ''} suggested
        </span>
      )}
    </div>
  );
};
