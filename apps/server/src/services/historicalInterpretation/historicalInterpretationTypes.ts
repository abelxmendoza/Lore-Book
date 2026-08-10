export const HISTORICAL_INTERPRETATION_VERSION = 'historical-interpretation-v1' as const;

export type InterpretationAuthor = 'USER' | 'LOREBOOK';
export type InterpretationStatus = 'PROPOSED' | 'CANONICAL' | 'SUPERSEDED' | 'REJECTED';
export type InterpretationKind = 'MEANING' | 'LESSON' | 'EMOTION' | 'IDENTITY_REFRAME';

export type InterpretationEvidenceRef = {
  sourceType: 'chat_message' | 'conversation_message' | 'journal_entry' | 'document' | 'manual';
  sourceId: string;
};

export type HistoricalInterpretationRecord = {
  id: string;
  userId: string;
  eventRecordId: string;
  resolvedEventId: string | null;
  interpretation: string;
  kind: InterpretationKind;
  author: InterpretationAuthor;
  status: InterpretationStatus;
  confidence: number;
  createdAt: string;
  replacesId: string | null;
  whyChanged: string | null;
  supportingEvidence: InterpretationEvidenceRef[];
  contradictingEvidence: InterpretationEvidenceRef[];
  sourceConversationMessageId: string | null;
};

export type InterpretationCandidate = Pick<
  HistoricalInterpretationRecord,
  'interpretation' | 'kind' | 'confidence' | 'whyChanged'
>;

export type HistoricalInterpretationTimeline = {
  eventRecordId: string;
  historicalFactImmutable: true;
  interpretations: HistoricalInterpretationRecord[];
  currentUnderstanding: HistoricalInterpretationRecord | null;
  alternativeInterpretations: HistoricalInterpretationRecord[];
};
