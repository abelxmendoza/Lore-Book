import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type {
  CorrectedPreviewSpan,
  CorrectedEntityStatus,
  EntityCorrectionAction,
  CorrectionSource,
} from './entityCorrectionTypes';
import { colorKeyForPreviewType } from './entityColorMap';

export function spanToId(span: Pick<LexicalPreviewSpan, 'start' | 'end' | 'type'>): string {
  return `${span.start}:${span.end}:${span.type}`;
}

export function toCorrectedPreviewSpan(
  span: LexicalPreviewSpan,
  source: CorrectionSource = 'composer'
): CorrectedPreviewSpan {
  return {
    id: spanToId(span),
    text: span.text,
    start: span.start,
    end: span.end,
    originalType: span.type,
    originalSubtype: span.subtype,
    colorKey: span.colorKey,
    entityStatus: span.entityStatus === 'known' ? 'known' : 'new',
    linkedEntityId: span.matchedEntityId,
    linkedEntityName: span.matchedEntityName,
    parentContext: span.parentContext,
    correctionAction: 'detected',
    confidence: span.confidence,
    requiresReview: span.needsReview,
    correctionSource: source,
  };
}

export type CorrectionState = {
  byId: Map<string, CorrectedPreviewSpan>;
  ignoredPhrases: string[];
};

export function createEmptyCorrectionState(): CorrectionState {
  return { byId: new Map(), ignoredPhrases: [] };
}

function upsert(state: CorrectionState, span: CorrectedPreviewSpan): CorrectionState {
  const byId = new Map(state.byId);
  byId.set(span.id, span);
  return { ...state, byId };
}

function patch(
  state: CorrectionState,
  spanId: string,
  patchFn: (s: CorrectedPreviewSpan) => CorrectedPreviewSpan
): CorrectionState {
  const existing = state.byId.get(spanId);
  if (!existing) return state;
  return upsert(state, patchFn(existing));
}

function effectiveType(span: CorrectedPreviewSpan): string {
  return span.correctedType ?? span.originalType;
}

export function applyCorrectionAction(
  state: CorrectionState,
  action: EntityCorrectionAction,
  baseSpan?: CorrectedPreviewSpan
): CorrectionState {
  const source = action.source ?? 'composer';

  if (action.kind === 'ignore_phrase') {
    const ignoredPhrases = [...new Set([...state.ignoredPhrases, action.phrase.toLowerCase()])];
    let next: CorrectionState = { ...state, ignoredPhrases };
    if (action.spanId && next.byId.has(action.spanId)) {
      next = upsert(next, {
        ...next.byId.get(action.spanId)!,
        entityStatus: 'ignored',
        correctionAction: 'ignore_phrase',
        correctionSource: source,
      });
      next = { ...next, ignoredPhrases };
    }
    return next;
  }

  if (!action.spanId && action.kind !== 'merge_spans') return state;

  switch (action.kind) {
    case 'confirm':
      return patch(state, action.spanId, (s) => ({
        ...s,
        entityStatus: 'confirmed',
        userConfirmed: true,
        correctionAction: 'confirm',
        correctionSource: source,
      }));

    case 'change_type':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: action.newType,
        colorKey: colorKeyForPreviewType(action.newType),
        correctionAction: 'change_type',
        correctionSource: source,
      }));

    case 'change_subtype':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedSubtype: action.newSubtype,
        correctionAction: 'change_subtype',
        correctionSource: source,
      }));

    case 'link_existing':
      return patch(state, action.spanId, (s) => ({
        ...s,
        linkedEntityId: action.entityId,
        linkedEntityName: action.entityName,
        linkedEntityType: action.entityType,
        entityStatus: 'known',
        userConfirmed: true,
        correctionAction: 'link_existing_entity',
        correctionSource: source,
      }));

    case 'create_new':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: action.entityType,
        entityStatus: 'new',
        correctionAction: 'create_new',
        correctionSource: source,
      }));

    case 'rename':
      return patch(state, action.spanId, (s) => ({
        ...s,
        displayNameOverride: action.newText,
        correctionAction: 'rename',
        correctionSource: source,
      }));

    case 'mark_wrong':
      return patch(state, action.spanId, (s) => ({
        ...s,
        entityStatus: 'wrong',
        correctionAction: 'mark_wrong',
        correctionSource: source,
      }));

    case 'set_parent':
      return patch(state, action.spanId, (s) => ({
        ...s,
        parentEntityId: action.parentEntityId,
        parentEntityName: action.parentEntityName,
        parentEntityType: action.parentEntityType,
        parentContext: `PARENT: ${action.parentEntityName}`,
        correctionAction: 'set_parent',
        correctionSource: source,
      }));

    case 'mark_employer':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'ORGANIZATION',
        correctedSubtype: 'EMPLOYER',
        colorKey: 'organization',
        correctionAction: 'mark_employer',
        correctionSource: source,
      }));

    case 'mark_worksite':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'DEPLOYMENT_SITE',
        correctedSubtype: 'WORKSITE',
        colorKey: 'worksite',
        requiresReview: true,
        correctionAction: 'mark_worksite',
        correctionSource: source,
      }));

    case 'mark_coworker':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'PERSON',
        correctedSubtype: 'COWORKER',
        colorKey: 'person',
        correctionAction: 'mark_coworker',
        correctionSource: source,
      }));

    case 'mark_manager':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'PERSON',
        correctedSubtype: 'MANAGER',
        colorKey: 'person',
        requiresReview: true,
        correctionAction: 'mark_manager',
        correctionSource: source,
      }));

    case 'mark_role':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'ROLE',
        correctedSubtype: 'JOB_TITLE',
        colorKey: 'role',
        displayNameOverride: action.displayTitle ?? s.displayNameOverride,
        correctionAction: 'mark_role',
        correctionSource: source,
      }));

    case 'mark_skill':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'SKILL',
        colorKey: 'skill',
        correctionAction: 'mark_skill',
        correctionSource: source,
      }));

    case 'mark_hobby':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'INTEREST',
        colorKey: 'interest',
        correctionAction: 'mark_hobby',
        correctionSource: source,
      }));

    case 'mark_group':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'GROUP',
        colorKey: 'group',
        correctionAction: 'mark_group',
        correctionSource: source,
      }));

    case 'mark_event':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'EVENT',
        colorKey: 'event',
        requiresReview: true,
        correctionAction: 'mark_event',
        correctionSource: source,
      }));

    case 'mark_time_period':
      return patch(state, action.spanId, (s) => ({
        ...s,
        correctedType: 'TIME_PERIOD',
        colorKey: 'time',
        requiresReview: true,
        correctionAction: 'mark_time_period',
        correctionSource: source,
      }));

    case 'mark_sensitive':
      return patch(state, action.spanId, (s) => ({
        ...s,
        sensitive: true,
        requiresReview: true,
        correctionAction: 'mark_sensitive',
        correctionSource: source,
      }));

    case 'review_later':
      return patch(state, action.spanId, (s) => ({
        ...s,
        requiresReview: true,
        correctionAction: 'review_later',
        correctionSource: source,
      }));

    case 'split_span':
    case 'merge_spans':
      return state;

    default:
      return state;
  }
}

export function isPhraseIgnored(state: CorrectionState, phrase: string): boolean {
  const key = phrase.toLowerCase().trim();
  return state.ignoredPhrases.some((p) => key.includes(p) || p.includes(key));
}

export function mergeBaseSpans(
  state: CorrectionState,
  spans: LexicalPreviewSpan[],
  source: CorrectionSource = 'composer'
): CorrectionState {
  const byId = new Map(state.byId);
  for (const span of spans) {
    const id = spanToId(span);
    if (!byId.has(id)) {
      byId.set(id, toCorrectedPreviewSpan(span, source));
    }
  }
  return { ...state, byId };
}

export function visibleCorrectedSpans(state: CorrectionState): CorrectedPreviewSpan[] {
  return [...state.byId.values()]
    .filter((s) => s.entityStatus !== 'ignored' && s.entityStatus !== 'wrong')
    .sort((a, b) => a.start - b.start);
}

export function correctedSpanToLexicalPreview(span: CorrectedPreviewSpan): LexicalPreviewSpan {
  const type = span.correctedType ?? span.originalType;
  return {
    text: span.displayNameOverride ?? span.text,
    start: span.start,
    end: span.end,
    type,
    subtype: span.correctedSubtype ?? span.originalSubtype,
    colorKey: span.colorKey ?? colorKeyForPreviewType(type),
    confidence: span.confidenceOverride ?? span.confidence ?? 0.8,
    temporary: true,
    needsReview: span.requiresReview ?? span.sensitive,
    entityStatus: span.entityStatus === 'confirmed' || span.entityStatus === 'known' || !!span.linkedEntityId ? 'known' : 'new',
    matchedEntityId: span.linkedEntityId,
    matchedEntityName: span.linkedEntityName ?? span.displayNameOverride,
    parentContext: span.parentContext ?? (span.parentEntityName ? `PARENT: ${span.parentEntityName}` : undefined),
  };
}

export function correctionsForSend(state: CorrectionState): CorrectedPreviewSpan[] {
  return [...state.byId.values()].filter((s) => s.correctionAction !== 'detected' || s.userConfirmed);
}

export function displayStatus(span: CorrectedPreviewSpan): CorrectedEntityStatus {
  if (span.userConfirmed) return 'confirmed';
  return span.entityStatus;
}
