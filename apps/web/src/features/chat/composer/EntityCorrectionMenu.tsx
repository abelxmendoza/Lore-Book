import type { CorrectedPreviewSpan, EntityCorrectionAction, EntityTypePickerValue } from '../../../lib/entityCorrectionTypes';
import { ENTITY_COLOR_MAP, colorKeyForPreviewType } from '../../../lib/entityColorMap';
import { displayStatus } from '../../../lib/correctedPreviewSpanReducer';

type EntityCorrectionMenuProps = {
  span: CorrectedPreviewSpan;
  onAction: (action: EntityCorrectionAction) => void;
  onOpenLinkPicker: () => void;
};

const TYPE_OPTIONS: EntityTypePickerValue[] = [
  'PERSON',
  'ORGANIZATION',
  'PLACE',
  'GROUP',
  'COMMUNITY',
  'ROLE',
  'SKILL',
  'TASK',
  'WORK_ACTIVITY',
  'DEPLOYMENT_SITE',
  'EVENT',
  'TIME_PERIOD',
  'RELATIONSHIP',
  'PREFERENCE',
  'EMOTIONAL_SIGNIFICANCE',
  'OBJECT',
  'UNKNOWN',
];

const QUICK_ACTIONS: Array<{
  label: string;
  kind: EntityCorrectionAction['kind'];
  subtype?: string;
}> = [
  { label: 'Employer', kind: 'mark_employer' },
  { label: 'Worksite', kind: 'mark_worksite' },
  { label: 'Coworker', kind: 'mark_coworker' },
  { label: 'Manager', kind: 'mark_manager' },
  { label: 'Role', kind: 'mark_role' },
  { label: 'Skill', kind: 'mark_skill' },
  { label: 'Group', kind: 'mark_group' },
  { label: 'Event', kind: 'mark_event' },
  { label: 'Time', kind: 'mark_time_period' },
];

function statusLabel(status: ReturnType<typeof displayStatus>): string {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'known': return 'Known in LoreBook';
    case 'new': return 'New — not yet saved';
    case 'ignored': return 'Ignored';
    case 'wrong': return 'Marked wrong';
    default: return status;
  }
}

export function EntityCorrectionMenu({
  span,
  onAction,
  onOpenLinkPicker,
}: EntityCorrectionMenuProps) {
  const effectiveType = span.correctedType ?? span.originalType;
  const colorKey = colorKeyForPreviewType(effectiveType, span.colorKey);
  const label = ENTITY_COLOR_MAP[colorKey]?.label ?? effectiveType;
  const status = displayStatus(span);

  const fire = (kind: EntityCorrectionAction['kind'], extra?: Partial<EntityCorrectionAction>) => {
    onAction({ kind, spanId: span.id, ...extra } as EntityCorrectionAction);
  };

  return (
    <div className="space-y-2" data-testid="entity-correction-menu">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] ${ENTITY_COLOR_MAP[colorKey].chip}`}>
          {label}
          {span.correctedSubtype ?? span.originalSubtype ? ` · ${span.correctedSubtype ?? span.originalSubtype}` : ''}
        </span>
        <span className="text-[10px] text-white/45">{Math.round((span.confidenceOverride ?? span.confidence ?? 0) * 100)}%</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            status === 'confirmed' || status === 'known' || span.linkedEntityId
              ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
              : 'bg-white/8 text-white/55 border border-dashed border-white/20'
          }`}
          data-testid="entity-correction-status"
        >
          {span.linkedEntityId ? 'Linked · Known' : statusLabel(status)}
        </span>
      </div>

      {(span.parentContext || span.parentEntityName) && (
        <p className="text-[10px] text-violet-200/75">
          Parent: {(span.parentEntityName ?? span.parentContext)?.replace(/^PARENT:\s*/i, '')}
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        <button type="button" className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-200 text-[10px]" onClick={() => fire('confirm')}>
          Confirm
        </button>
        <button
          type="button"
          data-testid="entity-correction-link-existing"
          className="px-2 py-1 rounded-md bg-violet-500/15 text-violet-200 text-[10px]"
          onClick={onOpenLinkPicker}
        >
          Link to existing
        </button>
        <button type="button" className="px-2 py-1 rounded-md bg-white/8 text-white/60 text-[10px]" onClick={() => fire('mark_wrong')}>
          Wrong
        </button>
        <button type="button" className="px-2 py-1 rounded-md bg-white/8 text-white/60 text-[10px]" onClick={() => fire('ignore_phrase', { phrase: span.text })}>
          Ignore
        </button>
        <button type="button" className="px-2 py-1 rounded-md bg-amber-500/12 text-amber-200 text-[10px]" onClick={() => fire('review_later')}>
          Review later
        </button>
        <button type="button" className="px-2 py-1 rounded-md bg-red-500/12 text-red-200 text-[10px]" onClick={() => fire('mark_sensitive')}>
          Sensitive
        </button>
      </div>

      <label className="block text-[10px] text-white/40">Change type</label>
      <select
        data-testid="entity-correction-type-select"
        defaultValue={effectiveType}
        onChange={(e) => fire('change_type', { newType: e.target.value as EntityTypePickerValue })}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-xs"
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <p className="text-[10px] text-white/40">Quick classify</p>
      <div className="flex flex-wrap gap-1">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className="px-1.5 py-0.5 rounded bg-white/6 text-white/65 text-[9px] hover:bg-white/10"
            onClick={() => fire(a.kind)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <label className="block text-[10px] text-white/40">Set parent entity</label>
      <input
        data-testid="entity-correction-parent-input"
        placeholder="e.g. Vanguard Robotics"
        defaultValue={span.parentEntityName ?? ''}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-xs mb-1"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const name = (e.target as HTMLInputElement).value.trim();
            if (name) fire('set_parent', { parentEntityName: name });
          }
        }}
      />

      <label className="block text-[10px] text-white/40">Rename display text</label>
      <input
        data-testid="entity-correction-rename-input"
        placeholder="Normalized name"
        defaultValue={span.displayNameOverride ?? span.text}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            fire('rename', { newText: (e.target as HTMLInputElement).value.trim() });
          }
        }}
      />
    </div>
  );
}
