/** Message-scoped preview correction — truth-training layer for composer entities. */

export type CorrectedEntityStatus =
  | 'known'
  | 'new'
  | 'ignored'
  | 'wrong'
  | 'confirmed';

export type CorrectionSource = 'composer' | 'chat_chip' | 'review_page';

export type EntityTypePickerValue =
  | 'PERSON'
  | 'PLACE'
  | 'ORGANIZATION'
  | 'GROUP'
  | 'COMMUNITY'
  | 'ROLE'
  | 'SKILL'
  | 'TASK'
  | 'WORK_ACTIVITY'
  | 'EVENT'
  | 'TIME_PERIOD'
  | 'RELATIONSHIP'
  | 'PREFERENCE'
  | 'EMOTIONAL_SIGNIFICANCE'
  | 'DEPLOYMENT_SITE'
  | 'OBJECT'
  | 'UNKNOWN';

export type CorrectedPreviewSpan = {
  id: string;
  text: string;
  start: number;
  end: number;
  originalType: string;
  correctedType?: string;
  originalSubtype?: string;
  correctedSubtype?: string;
  colorKey?: string;
  entityStatus: CorrectedEntityStatus;
  linkedEntityId?: string;
  linkedEntityName?: string;
  linkedEntityType?: string;
  parentEntityId?: string;
  parentEntityName?: string;
  parentEntityType?: string;
  displayNameOverride?: string;
  correctionAction: string;
  confidence?: number;
  confidenceOverride?: number;
  sensitive?: boolean;
  requiresReview?: boolean;
  userConfirmed?: boolean;
  correctionSource: CorrectionSource;
  parentContext?: string;
};

export type EntityCorrectionAction =
  | { kind: 'confirm'; spanId: string; source?: CorrectionSource }
  | { kind: 'change_type'; spanId: string; newType: EntityTypePickerValue; source?: CorrectionSource }
  | { kind: 'change_subtype'; spanId: string; newSubtype: string; source?: CorrectionSource }
  | {
      kind: 'link_existing';
      spanId: string;
      entityId: string;
      entityName: string;
      entityType: string;
      source?: CorrectionSource;
    }
  | { kind: 'create_new'; spanId: string; entityType: EntityTypePickerValue; source?: CorrectionSource }
  | { kind: 'rename'; spanId: string; newText: string; source?: CorrectionSource }
  | { kind: 'mark_wrong'; spanId: string; source?: CorrectionSource }
  | { kind: 'ignore_phrase'; spanId: string; phrase: string; source?: CorrectionSource }
  | { kind: 'split_span'; spanId: string; splitAt: number; source?: CorrectionSource }
  | { kind: 'merge_spans'; spanIds: string[]; source?: CorrectionSource }
  | { kind: 'set_parent'; spanId: string; parentEntityId?: string; parentEntityName: string; parentEntityType?: string; source?: CorrectionSource }
  | { kind: 'mark_employer'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_worksite'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_coworker'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_manager'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_role'; spanId: string; displayTitle?: string; source?: CorrectionSource }
  | { kind: 'mark_skill'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_hobby'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_group'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_event'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_time_period'; spanId: string; source?: CorrectionSource }
  | { kind: 'mark_sensitive'; spanId: string; source?: CorrectionSource }
  | { kind: 'review_later'; spanId: string; source?: CorrectionSource };
