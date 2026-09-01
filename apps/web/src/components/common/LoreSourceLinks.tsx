import { Link2, MessageSquare, FileText, ImageIcon, Calendar, PenLine, Plug } from 'lucide-react';

import type { LoreEntityRef, LoreIntakeChannel, LoreSourceRef } from '../../lib/api-contracts';
import {
  formatIntakeChannelLabel,
  formatLoreSourceSummary,
  loreEntityRoute,
  loreSourceRoute,
} from '../../lib/loreSourcePresentation';

const INTAKE_ICONS: Record<LoreIntakeChannel, typeof MessageSquare> = {
  chat: MessageSquare,
  document_upload: FileText,
  photo: ImageIcon,
  screenshot: ImageIcon,
  journal: PenLine,
  calendar: Calendar,
  manual: PenLine,
  integration: Plug,
  unknown: Link2,
};

type Props = {
  intakeChannel?: LoreIntakeChannel;
  sources?: LoreSourceRef[];
  entities?: LoreEntityRef[];
  compact?: boolean;
  className?: string;
};

export function LoreSourceLinks({
  intakeChannel,
  sources = [],
  entities = [],
  compact = false,
  className = '',
}: Props) {
  const channel = intakeChannel ?? sources[0]?.intakeChannel ?? 'unknown';
  const ChannelIcon = INTAKE_ICONS[channel] ?? Link2;
  const visibleSources = sources.slice(0, compact ? 2 : 6);
  const visibleEntities = entities.slice(0, compact ? 2 : 6);

  if (!visibleSources.length && !visibleEntities.length && channel === 'unknown') {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">
          <ChannelIcon className="h-3 w-3 shrink-0" />
          {formatIntakeChannelLabel(channel)}
        </span>
      </div>

      {visibleSources.length > 0 && (
        <ul className="space-y-1">
          {visibleSources.map((source) => {
            const route = loreSourceRoute(source);
            const label = formatLoreSourceSummary(source);
            const content = (
              <>
                <span className="text-white/75">{label}</span>
                <span className="text-white/30"> · {source.kind.replace(/_/g, ' ')}</span>
              </>
            );
            return (
              <li key={`${source.kind}:${source.id}`} className="text-[11px] leading-snug">
                {route ? (
                  <a href={route} className="rounded px-0.5 hover:text-violet-200 hover:underline">
                    {content}
                  </a>
                ) : (
                  <span>{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visibleEntities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleEntities.map((entity) => {
            const route = loreEntityRoute(entity);
            const label = entity.name ?? `${entity.kind} ${entity.id.slice(0, 8)}`;
            return route ? (
              <a
                key={`${entity.kind}:${entity.id}`}
                href={route}
                className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100 hover:bg-violet-500/20"
              >
                {label}
              </a>
            ) : (
              <span
                key={`${entity.kind}:${entity.id}`}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60"
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
