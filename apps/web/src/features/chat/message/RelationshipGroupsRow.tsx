import type { ReactNode } from 'react';
import { Users, Briefcase, Heart, UserPlus, Sparkles } from 'lucide-react';
import type { RelationshipGroupSummary } from '../utils/relationshipMetadata';
import { CompactEntityChip, CompactChipStrip } from '../components/CompactEntityChip';

interface RelationshipGroupsRowProps {
  groups: RelationshipGroupSummary[];
  label?: string;
  max?: number;
}

const SCOPE_LABEL: Record<string, string> = {
  FAMILY: 'family',
  PROFESSIONAL: 'work',
  SOCIAL: 'social',
  ROMANTIC: 'love',
  ADVERSARIAL: 'tension',
  CIRCUMSTANTIAL: 'mentioned',
  UNKNOWN: 'rel',
};

const SCOPE_COLOR: Record<string, string> = {
  FAMILY: 'border-rose-500/35 bg-rose-500/10 text-rose-200',
  PROFESSIONAL: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  SOCIAL: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
  ROMANTIC: 'border-pink-500/35 bg-pink-500/10 text-pink-200',
  ADVERSARIAL: 'border-orange-500/35 bg-orange-500/10 text-orange-200',
  CIRCUMSTANTIAL: 'border-white/12 bg-white/[0.04] text-white/50',
  UNKNOWN: 'border-white/12 bg-white/[0.04] text-white/50',
};

const SCOPE_ICON: Record<string, ReactNode> = {
  FAMILY: <Users className="h-2.5 w-2.5 flex-shrink-0" />,
  PROFESSIONAL: <Briefcase className="h-2.5 w-2.5 flex-shrink-0" />,
  SOCIAL: <UserPlus className="h-2.5 w-2.5 flex-shrink-0" />,
  ROMANTIC: <Heart className="h-2.5 w-2.5 flex-shrink-0" />,
  ADVERSARIAL: <Sparkles className="h-2.5 w-2.5 flex-shrink-0" />,
  CIRCUMSTANTIAL: <Users className="h-2.5 w-2.5 flex-shrink-0" />,
  UNKNOWN: <Users className="h-2.5 w-2.5 flex-shrink-0" />,
};

function formatScope(scope: string): string {
  return SCOPE_LABEL[scope] ?? scope.toLowerCase().replace(/_/g, ' ');
}

function compactNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export function RelationshipGroupsRow({
  groups,
  label = 'relationships',
  max = 4,
}: RelationshipGroupsRowProps) {
  if (!groups.length) return null;

  const visible = groups.slice(0, max);
  const overflow = groups.length - visible.length;

  return (
    <CompactChipStrip label={label.replace(/:$/, '')}>
      {visible.map((group) => {
        const scopeKey = group.scope in SCOPE_COLOR ? group.scope : 'UNKNOWN';
        const names = compactNames(group.entityNames);
        return (
          <CompactEntityChip
            key={`${group.scope}:${group.entityNames.join(',')}`}
            className={`${SCOPE_COLOR[scopeKey]} max-w-[120px] sm:max-w-[140px]`}
            title={
              group.confidence != null
                ? `${formatScope(group.scope)} · ${group.entityNames.join(', ')} · ${Math.round(group.confidence * 100)}%`
                : `${formatScope(group.scope)} · ${group.entityNames.join(', ')}`
            }
          >
            {SCOPE_ICON[scopeKey]}
            <span className="opacity-75 truncate">{formatScope(group.scope)}</span>
            {names && (
              <>
                <span className="text-white/30">·</span>
                <span className="truncate">{names}</span>
              </>
            )}
          </CompactEntityChip>
        );
      })}
      {overflow > 0 && (
        <span className="text-[10px] text-white/30 shrink-0">+{overflow}</span>
      )}
    </CompactChipStrip>
  );
}
