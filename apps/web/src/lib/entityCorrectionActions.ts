/** @deprecated Import from entityCorrectionTypes / correctedPreviewSpanReducer */
export type {
  CorrectedPreviewSpan,
  EntityCorrectionAction,
  EntityTypePickerValue,
} from './entityCorrectionTypes';

export {
  applyCorrectionAction as applyEntityCorrection,
  createEmptyCorrectionState,
  isPhraseIgnored,
  spanToId,
} from './correctedPreviewSpanReducer';

export type { CorrectionState as EntityCorrectionState } from './correctedPreviewSpanReducer';
