import type { ReactNode } from 'react';
import { Users, Briefcase, Heart, UserPlus, Sparkles } from 'lucide-react';
import type { RelationshipGroupSummary } from '../utils/relationshipMetadata';

interface RelationshipGroupsRowProps {
  groups: RelationshipGroupSummary[];
  label?: string;
  max?: number;
}

const SCOPE_LABEL: Record<string, string> = {
  FAMILY: 'family',
  PROFESSIONAL: 'work',
  SOCIAL: 'social',
  ROMANTIC: 'romantic',
  ADVERSARIAL: 'tension',
  CIRCUMSTANTIAL: 'mentioned',
  UNKNOWN: 'relationships',
};

const SCOPE_COLOR: Record<string, string> = {
  FAMILY: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  PROFESSIONAL: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  SOCIAL: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  ROMANTIC: 'border-pink-500/40 bg-pink-500/10 text-pink-200',
  ADVERSARIAL: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  CIRCUMSTANTIAL: 'border-white/15 bg-white/[0.04] text-white/55',
  UNKNOWN: 'border-white/15 bg-white/[0.04] text-white/55',
};

const SCOPE_ICON: Record<string, ReactNode> = {
  FAMILY: <Users className="h-3 w-3 flex-shrink-0" />,
  PROFESSIONAL: <Briefcase className="h-3 w-3 flex-shrink-0" />,
  SOCIAL: <UserPlus className="h-3 w-3 flex-shrink-0" />,
  ROMANTIC: <Heart className="h-3 w-3 flex-shrink-0" />,
  ADVERSARIAL: <Sparkles className="h-3 w-3 flex-shrink-0" />,
  CIRCUMSTANTIAL: <Users className="h-3 w-3 flex-shrink-0" />,
  UNKNOWN: <Users className="h-3 w-3 flex-shrink-0" />,
};

function formatScope(scope: string): string {
  return SCOPE_LABEL[scope] ?? scope.toLowerCase().replace(/_/g, ' ');
}

export function RelationshipGroupsRow({
  groups,
  label = 'relationships:',
  max = 4,
}: RelationshipGroupsRowProps) {
  if (!groups.length) return null;

  const visible = groups.slice(0, max);
  const overflow = groups.length - visible.length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-white/30 mr-0.5">{label}</span>
      {visible.map((group) => {
        const scopeKey = group.scope in SCOPE_COLOR ? group.scope : 'UNKNOWN';
        const names = group.entityNames.join(', ');
        return (
          <span
            key={`${group.scope}:${names}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SCOPE_COLOR[scopeKey]}`}
            title={
              group.confidence != null
                ? `${formatScope(group.scope)} · ${Math.round(group.confidence * 100)}% confidence`
                : formatScope(group.scope)
            }
          >
            {SCOPE_ICON[scopeKey]}
            <span className="opacity-75">{formatScope(group.scope)}:</span>
            <span>{names}</span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-[11px] text-white/30">+{overflow} more</span>
      )}
    </div>
  );
}
