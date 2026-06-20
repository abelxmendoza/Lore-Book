import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GitMerge, Layers, Link2, Tag } from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { EntityType } from '../../api/entityResolution';
import {
  consolidationModeDescription,
  consolidationModeLabel,
  consolidationModeToDecision,
  defaultConsolidationMode,
  getAvailableConsolidationModes,
  type ConsolidationMode,
} from '../../lib/entityConsolidation';

export type ConsolidationDialogEntity = {
  id: string;
  name: string;
  type: EntityType;
  aliases?: string[];
};

type Props = {
  open: boolean;
  entityA: ConsolidationDialogEntity;
  entityB: ConsolidationDialogEntity;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    mode: ConsolidationMode;
    sourceId: string;
    targetId: string;
    reason: string;
  }) => void;
};

const MODE_ICONS: Record<ConsolidationMode, typeof GitMerge> = {
  merge: GitMerge,
  nested: Layers,
  link: Link2,
  alias: Tag,
};

export function EntityConsolidationDialog({
  open,
  entityA,
  entityB,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const availableModes = useMemo(
    () => getAvailableConsolidationModes(entityA.type, entityB.type),
    [entityA.type, entityB.type],
  );

  const [mode, setMode] = useState<ConsolidationMode>(() =>
    defaultConsolidationMode(entityA.type, entityB.type),
  );
  const [keeperId, setKeeperId] = useState(entityA.id);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(defaultConsolidationMode(entityA.type, entityB.type));
    setKeeperId(entityA.id);
    setReason('');
  }, [open, entityA.id, entityB.id, entityA.type, entityB.type]);

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0] ?? 'link');
    }
  }, [availableModes, mode]);

  const nestedChildId = keeperId === entityA.id ? entityB.id : entityA.id;
  const nestedParentId = keeperId;
  const nestedChild = nestedChildId === entityA.id ? entityA : entityB;
  const nestedParent = nestedParentId === entityA.id ? entityA : entityB;

  const mergeSourceId = keeperId === entityA.id ? entityB.id : entityA.id;
  const mergeTargetId = keeperId;

  const handleSubmit = () => {
    if (!reason.trim()) return;

    if (mode === 'nested') {
      onConfirm({
        mode,
        sourceId: nestedChildId,
        targetId: nestedParentId,
        reason: reason.trim(),
      });
      return;
    }

    if (mode === 'link') {
      onConfirm({
        mode,
        sourceId: entityA.id,
        targetId: entityB.id,
        reason: reason.trim(),
      });
      return;
    }

    onConfirm({
      mode,
      sourceId: mergeSourceId,
      targetId: mergeTargetId,
      reason: reason.trim(),
    });
  };

  const submitLabel =
    mode === 'merge'
      ? 'Combine into one'
      : mode === 'nested'
        ? 'Nest as subgroup'
        : mode === 'alias'
          ? 'Add as alias'
          : 'Link entities';

  return (
    <Modal isOpen={open} onClose={onClose} title="Resolve duplicate pair">
      <div className="space-y-4">
        <p className="text-sm text-white/70">
          Choose how these entities relate. You can combine them, nest one as a subgroup, link them,
          or treat one name as an alias.
        </p>

        <div className="space-y-2">
          {availableModes.map((option) => {
            const Icon = MODE_ICONS[option];
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition ${
                  active
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-primary' : 'text-white/40'}`} />
                  <div>
                    <p className={`text-sm font-medium ${active ? 'text-white' : 'text-white/80'}`}>
                      {consolidationModeLabel(option)}
                    </p>
                    <p className="text-xs text-white/45 mt-0.5">{consolidationModeDescription(option)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {mode !== 'link' && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-white/55 uppercase tracking-wide">
              {mode === 'nested' ? 'Parent container' : 'Canonical keeper'}
            </p>
            <div className="flex flex-wrap gap-2">
              {[entityA, entityB].map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => setKeeperId(entity.id)}
                  className={`rounded-full px-3 py-1.5 text-xs border transition ${
                    keeperId === entity.id
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-white/15 text-white/60 hover:border-white/30'
                  }`}
                >
                  {entity.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/30 p-3">
          {mode === 'nested' ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <p className="text-xs text-primary/70 uppercase tracking-wide">Parent</p>
                <p className="text-sm font-semibold text-white">{nestedParent.name}</p>
                <p className="text-[11px] text-white/40">{nestedParent.type}</p>
              </div>
              <div className="ml-4 rounded-lg border border-white/15 bg-black/40 px-3 py-2 relative before:absolute before:left-0 before:top-0 before:bottom-1/2 before:w-3 before:border-l before:border-b before:border-white/20">
                <p className="text-xs text-white/45 uppercase tracking-wide">Nested subgroup</p>
                <p className="text-sm font-medium text-white">{nestedChild.name}</p>
                <p className="text-[11px] text-white/40">{nestedChild.type}</p>
              </div>
            </div>
          ) : mode === 'link' ? (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{entityA.name}</p>
                <p className="text-xs text-white/40">{entityA.type}</p>
              </div>
              <Link2 className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1 text-right">
                <p className="text-sm font-semibold text-white">{entityB.name}</p>
                <p className="text-xs text-white/40">{entityB.type}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {entityA.id === mergeSourceId ? entityA.name : entityB.name}
                </p>
                <p className="text-xs text-white/40">folds into</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1 text-right">
                <p className="text-sm font-semibold text-white">
                  {entityA.id === mergeTargetId ? entityA.name : entityB.name}
                </p>
                <p className="text-xs text-white/40">{consolidationModeToDecision(mode)}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-white mb-2 block">
            Reason <span className="text-white/40 font-normal">(required)</span>
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              mode === 'nested'
                ? 'e.g. Startup Inc is a team inside Tech Corp'
                : 'e.g. Same person referred to differently'
            }
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reason.trim() || loading}>
            {loading ? 'Applying…' : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
