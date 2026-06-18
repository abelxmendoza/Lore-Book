import { UserPlus, GitMerge, HelpCircle } from 'lucide-react';

export type CreationOutcome = {
  mention: string;
  action: 'create' | 'merge' | 'defer' | 'reject';
  entityId?: string;
  entityName?: string;
  reason?: string;
  candidates?: Array<{ character_id: string; name: string; subtitle?: string }>;
  authority?: 'core' | 'legacy' | 'shadow';
};

type CreationOutcomePanelProps = {
  outcomes: CreationOutcome[];
  summary?: string | null;
};

const ACTION_STYLES: Record<
  CreationOutcome['action'],
  { label: string; className: string; Icon: typeof UserPlus }
> = {
  create: {
    label: 'New record',
    className: 'text-sky-400/80 bg-sky-400/8 border-sky-400/20',
    Icon: UserPlus,
  },
  merge: {
    label: 'Linked',
    className: 'text-emerald-400/80 bg-emerald-400/8 border-emerald-400/20',
    Icon: GitMerge,
  },
  defer: {
    label: 'Needs clarification',
    className: 'text-amber-400/80 bg-amber-400/8 border-amber-400/20',
    Icon: HelpCircle,
  },
  reject: {
    label: 'Skipped',
    className: 'text-zinc-400/70 bg-zinc-400/6 border-zinc-400/15',
    Icon: HelpCircle,
  },
};

function describeOutcome(outcome: CreationOutcome): string {
  if (outcome.action === 'create') return `Started a record for ${outcome.mention}`;
  if (outcome.action === 'merge') {
    return outcome.entityName
      ? `Linked ${outcome.mention} to ${outcome.entityName}`
      : `Linked ${outcome.mention} to an existing record`;
  }
  if (outcome.action === 'defer') {
    const count = outcome.candidates?.length ?? 0;
    return count > 0
      ? `${outcome.mention} could match ${count} existing ${count === 1 ? 'person' : 'people'}`
      : `Needs clarification on ${outcome.mention}`;
  }
  return outcome.reason ?? `Skipped ${outcome.mention}`;
}

export function CreationOutcomePanel({ outcomes, summary }: CreationOutcomePanelProps) {
  const visible = outcomes.filter((o) => o.action !== 'reject');
  if (visible.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5" data-testid="creation-outcome-panel">
      {summary && (
        <p className="text-xs text-zinc-400/80">{summary}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visible.map((outcome, index) => {
          const style = ACTION_STYLES[outcome.action];
          const Icon = style.Icon;
          return (
            <span
              key={`${outcome.mention}-${index}`}
              className={`inline-flex items-center gap-1 text-xs border rounded px-2 py-0.5 ${style.className}`}
              title={outcome.authority ? `Resolver: ${outcome.authority}` : undefined}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span>{describeOutcome(outcome)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
