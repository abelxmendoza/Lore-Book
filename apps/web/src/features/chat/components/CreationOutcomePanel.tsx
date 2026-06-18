import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, GitMerge, HelpCircle } from 'lucide-react';

import { loreAssetUrl } from '../../../api/loreAssets';
import {
  EntityClarificationChip,
  type EntityAmbiguity,
} from '../message/EntityClarificationChip';

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
  messageId: string;
  onPrefill?: (prompt: string) => void;
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

function toAmbiguity(outcome: CreationOutcome): EntityAmbiguity | null {
  if (!outcome.candidates?.length) return null;
  return {
    surface_text: outcome.mention,
    candidates: outcome.candidates.map((c) => ({
      entity_id: c.character_id,
      name: c.name,
      type: 'CHARACTER' as const,
      confidence: 0.75,
      last_seen: new Date().toISOString(),
      context_hint: c.subtitle,
    })),
  };
}

function openCreatedAsset(navigate: ReturnType<typeof useNavigate>, outcome: CreationOutcome) {
  if (!outcome.entityId) return;
  navigate(
    loreAssetUrl({
      tab: 'portrait',
      assetId: outcome.entityId,
      artifactType: 'character',
      centerId: outcome.entityId,
    })
  );
}

export function CreationOutcomePanel({
  outcomes,
  summary,
  messageId,
  onPrefill,
}: CreationOutcomePanelProps) {
  const navigate = useNavigate();
  const [resolvedMentions, setResolvedMentions] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () =>
      outcomes.filter(
        (o) => o.action !== 'reject' && !resolvedMentions.has(o.mention.toLowerCase())
      ),
    [outcomes, resolvedMentions]
  );

  const deferWithCandidates = visible.filter(
    (o) => o.action === 'defer' && (o.candidates?.length ?? 0) > 0
  );
  const chipOutcomes = visible.filter(
    (o) => !(o.action === 'defer' && (o.candidates?.length ?? 0) > 0)
  );

  const markResolved = (mention: string) => {
    setResolvedMentions((prev) => new Set([...prev, mention.toLowerCase()]));
  };

  if (visible.length === 0) return null;

  return (
    <div className="mt-2 space-y-2" data-testid="creation-outcome-panel">
      {summary && <p className="text-xs text-zinc-400/80">{summary}</p>}

      {chipOutcomes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chipOutcomes.map((outcome, index) => {
            const style = ACTION_STYLES[outcome.action];
            const Icon = style.Icon;
            const isNavigable =
              (outcome.action === 'create' || outcome.action === 'merge') && outcome.entityId;
            const isDeferPrompt = outcome.action === 'defer';

            if (isNavigable) {
              return (
                <button
                  key={`${outcome.mention}-${index}`}
                  type="button"
                  onClick={() => openCreatedAsset(navigate, outcome)}
                  className={`inline-flex items-center gap-1 text-xs border rounded px-2 py-0.5 transition-colors hover:opacity-90 ${style.className}`}
                  title={outcome.authority ? `Resolver: ${outcome.authority}` : 'Open in Lore Assets'}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{describeOutcome(outcome)}</span>
                </button>
              );
            }

            if (isDeferPrompt) {
              return (
                <button
                  key={`${outcome.mention}-${index}`}
                  type="button"
                  onClick={() =>
                    onPrefill?.(`When I said "${outcome.mention}", I meant `)
                  }
                  className={`inline-flex items-center gap-1 text-xs border rounded px-2 py-0.5 transition-colors hover:opacity-90 ${style.className}`}
                  title="Clarify in your next message"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{describeOutcome(outcome)}</span>
                </button>
              );
            }

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
      )}

      {deferWithCandidates.map((outcome) => {
        const ambiguity = toAmbiguity(outcome);
        if (!ambiguity) return null;
        return (
          <EntityClarificationChip
            key={`clarify-${outcome.mention}`}
            ambiguity={ambiguity}
            messageId={messageId}
            onResolved={() => markResolved(outcome.mention)}
            hasCreateNewOption
            multiSelect={ambiguity.candidates.length > 1}
          />
        );
      })}
    </div>
  );
}
