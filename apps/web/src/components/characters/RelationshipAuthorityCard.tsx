import { useState } from 'react';
import { Loader2, Pencil, UserCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  buildRelationshipAuthorityDebug,
  describeCurrentRelationship,
  isRelationshipLinkUuid,
  listCorrectedAuditStates,
  listPreviousGroundedStates,
  shouldShowRelationshipDebug,
  type RelationshipProjection,
} from '../../lib/relationshipAuthority';

const RELATIONSHIP_TYPE_OPTIONS = [
  'friend',
  'best friend',
  'close friend',
  'acquaintance',
  'coworker',
  'bandmate',
  'classmate',
  'roommate',
  'neighbor',
  'mentor',
  'rival',
  'ex',
  'estranged',
];

export type RelationshipAuthorityCardModel = {
  counterpartId: string;
  name: string;
  summary?: string | null;
  closenessScore?: number | null;
  linkId?: string | null;
  projection: RelationshipProjection;
  familyLabel?: string | null;
  sharedContext?: string | null;
};

type Props = {
  canonicalCharacterId: string;
  model: RelationshipAuthorityCardModel;
  busy?: boolean;
  onOpen: () => void;
  onChange: (nextType: string) => void;
  onEnd: () => void;
  onCorrect: () => void;
};

export function RelationshipAuthorityCard({
  canonicalCharacterId,
  model,
  busy = false,
  onOpen,
  onChange,
  onEnd,
  onCorrect,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [nextType, setNextType] = useState(model.projection.current?.type || 'friend');
  const current = describeCurrentRelationship(model.projection);
  const previous = listPreviousGroundedStates(model.projection);
  const corrected = listCorrectedAuditStates(model.projection);
  const debug = shouldShowRelationshipDebug()
    ? buildRelationshipAuthorityDebug(canonicalCharacterId, model.counterpartId, model.projection)
    : null;
  const canGovern = isRelationshipLinkUuid(model.linkId);

  return (
    <Card
      className="bg-black/40 border-border/50 hover:border-primary/50 hover:bg-black/60 transition-all"
      data-testid={`relationship-authority-card-${model.counterpartId}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="flex-1 text-left min-w-0" onClick={onOpen}>
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-white/35 shrink-0" aria-hidden="true" />
              <p className="font-medium text-white truncate">{model.name}</p>
            </div>
            <dl className="mt-2 space-y-1">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">Current</dt>
                <dd className="text-sm text-white" data-testid="relationship-current">
                  {current.headline}
                </dd>
              </div>
              {previous.length > 0 && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">Previously</dt>
                  <dd className="text-sm text-white/75" data-testid="relationship-previously">
                    {previous.join(' → ')}
                  </dd>
                </div>
              )}
              {model.sharedContext && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">Shared through</dt>
                  <dd className="text-sm text-white/70" data-testid="relationship-shared-through">
                    {model.sharedContext}
                  </dd>
                </div>
              )}
              {model.familyLabel && current.headline.toLowerCase() !== model.familyLabel.toLowerCase() && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-white/40">Family relationship</dt>
                  <dd className="text-sm text-white/70" data-testid="relationship-family-label">
                    {model.familyLabel}
                  </dd>
                </div>
              )}
              {model.projection.unresolvedConflicts.length > 0 && (
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-amber-300/70">Unresolved</dt>
                  <dd className="text-xs text-amber-200/80" data-testid="relationship-unresolved">
                    {model.projection.unresolvedConflicts[0]}
                  </dd>
                </div>
              )}
            </dl>
            {model.summary && <p className="text-sm text-white/60 mt-2">{model.summary}</p>}
          </button>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {model.closenessScore !== undefined && model.closenessScore !== null && (
              <div className="text-right">
                <span className="text-xs text-white/50 block">Closeness</span>
                <span className="text-sm font-medium text-primary">{model.closenessScore}/10</span>
              </div>
            )}
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/60"
            disabled={busy || !canGovern}
            aria-label={`Change relationship with ${model.name}`}
            data-testid="relationship-change"
            onClick={(e) => {
              e.stopPropagation();
              setEditing((open) => !open);
            }}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Change relationship
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/60"
            disabled={busy || current.isEnded || current.isCorrectedEmpty}
            aria-label={`End relationship with ${model.name}`}
            data-testid="relationship-end"
            onClick={(e) => {
              e.stopPropagation();
              onEnd();
            }}
          >
            End relationship
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/55"
            disabled={busy}
            aria-label={`Correct mistaken relationship with ${model.name}`}
            data-testid="relationship-correct"
            onClick={(e) => {
              e.stopPropagation();
              onCorrect();
            }}
          >
            Correct mistaken relationship
          </Button>
        </div>

        {editing && (
          <div
            className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              list={`relationship-type-options-${model.counterpartId}`}
              value={nextType}
              onChange={(e) => setNextType(e.target.value)}
              aria-label={`New relationship with ${model.name}`}
              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none"
            />
            <datalist id={`relationship-type-options-${model.counterpartId}`}>
              {RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!nextType.trim() || busy}
              data-testid="relationship-change-save"
              onClick={() => {
                onChange(nextType.trim());
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        )}

        {!canGovern && model.linkId && (
          <p className="mt-2 text-[10px] text-white/35">
            This inferred link has no governed id yet — ending it removes the cache row.
          </p>
        )}

        {debug && (
          <details className="mt-3 rounded-md border border-white/10 bg-black/30 p-2 text-[10px] text-white/45">
            <summary className="cursor-pointer text-white/55">Relationship diagnostics</summary>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5" data-testid="relationship-authority-debug">
              <dt>canonical character</dt>
              <dd>{debug.canonicalCharacterId}</dd>
              <dt>current</dt>
              <dd>
                {debug.currentType ?? 'null'} / {debug.currentStatus ?? 'null'}
              </dd>
              <dt>history count</dt>
              <dd>{debug.historyCount}</dd>
              <dt>latest transition</dt>
              <dd>
                {debug.latestTransition
                  ? `${debug.latestTransition.changeKind} → ${debug.latestTransition.toRelationshipType ?? 'null'}`
                  : 'none'}
              </dd>
              <dt>latest user correction</dt>
              <dd>{debug.latestUserCorrection?.id ?? (corrected.length ? 'user correction on file' : 'none')}</dd>
              <dt>corrected states</dt>
              <dd>{corrected.length ? corrected.join(', ') : 'none'}</dd>
              <dt>authority source</dt>
              <dd>{debug.authoritySource ?? 'none'}</dd>
              <dt>legacy fallback</dt>
              <dd>{debug.legacyFallbackActive ? 'yes' : 'no'}</dd>
              <dt>unresolved conflicts</dt>
              <dd>{debug.unresolvedConflicts.length ? debug.unresolvedConflicts.join(' | ') : 'none'}</dd>
            </dl>
            {corrected.length > 0 && (
              <p className="mt-1 text-white/50" data-testid="relationship-corrected-audit">
                LoreBook previously classified this relationship as {corrected.join(', ')} → corrected by user
              </p>
            )}
          </details>
        )}
      </CardContent>
    </Card>
  );
}
