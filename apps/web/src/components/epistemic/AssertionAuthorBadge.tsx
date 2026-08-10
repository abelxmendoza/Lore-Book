import { Bot, Eye, MessageSquareQuote, UserRound } from 'lucide-react';

import type { KernelActorKind, KernelEpistemicStance } from '../../api/knowledgeKernel';
import { Badge } from '../ui/badge';


type Props = {
  actorKind: KernelActorKind;
  stance: KernelEpistemicStance;
  actorLabel?: string | null;
  compact?: boolean;
};

export function AssertionAuthorBadge({ actorKind, stance, actorLabel, compact = false }: Props) {
  const sizeClass = compact
    ? 'gap-0.5 px-1 py-0 text-[9px] normal-case tracking-normal sm:gap-1 sm:px-1.5 sm:text-[10px]'
    : 'gap-1 px-2 py-0.5 text-[10px] normal-case tracking-normal';
  const iconClass = compact ? 'h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3' : 'h-3 w-3 shrink-0';

  if (stance === 'direct_observation') {
    return (
      <Badge variant="outline" className={`${sizeClass} border-sky-400/25 bg-sky-400/10 text-sky-200`}>
        <Eye className={iconClass} aria-hidden="true" />
        {compact ? 'Observed' : 'Directly observed'}
      </Badge>
    );
  }

  if (actorKind === 'user') {
    return (
      <Badge variant="outline" className={`${sizeClass} border-violet-400/25 bg-violet-400/10 text-violet-200`}>
        <UserRound className={iconClass} aria-hidden="true" />
        {stance === 'user_belief' ? 'You believed' : 'You said'}
      </Badge>
    );
  }

  if (actorKind === 'lorebook') {
    return (
      <Badge variant="outline" className={`${sizeClass} border-indigo-400/25 bg-indigo-400/10 text-indigo-200`}>
        <Bot className={iconClass} aria-hidden="true" />
        {stance === 'system_hypothesis' ? 'LoreBook suggests' : 'LoreBook noticed'}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`${sizeClass} border-cyan-400/25 bg-cyan-400/10 text-cyan-200`}>
      <MessageSquareQuote className={iconClass} aria-hidden="true" />
      {actorLabel ? `${actorLabel} reported` : 'Someone reported'}
    </Badge>
  );
}
