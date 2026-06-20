/** Shared correction types — server-side preview correction application. */

export type CorrectedEntityStatus =
  | 'known'
  | 'new'
  | 'ignored'
  | 'wrong'
  | 'confirmed';

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
  correctionSource: 'composer' | 'chat_chip' | 'review_page';
  parentContext?: string;
};

export type GlossaryCandidate = {
  term: string;
  category: string;
  aliases: string[];
  confidence: number;
  sourceCorrectionId: string;
  requiresConfirmation: true;
};

export type OntologyAliasCandidate = {
  entityId?: string;
  entityName: string;
  alias: string;
  entityType: string;
  confidence: number;
  requiresConfirmation: true;
};

export type CorrectionLinkAuditEntry = {
  spanText: string;
  originalType: string;
  linkedEntityId: string;
  linkedEntityType: string;
  selectedByUser: true;
  timestamp: string;
  messageId: string;
  typeConflict?: boolean;
};

export type CorrectionAuditRecord = {
  auditId: string;
  userId: string;
  messageId: string;
  threadId?: string;
  correctionCount: number;
  actions: string[];
  linkEntries?: CorrectionLinkAuditEntry[];
  createdAt: string;
};

export type ApplyPreviewCorrectionsInput = {
  userId: string;
  messageId: string;
  threadId?: string;
  text: string;
  corrections: CorrectedPreviewSpan[];
};

export type ApplyPreviewCorrectionsResult = {
  correctedSpans: CorrectedPreviewSpan[];
  glossaryCandidates: GlossaryCandidate[];
  ontologyAliasCandidates: OntologyAliasCandidate[];
  auditId: string;
  requiresReview: boolean;
};
