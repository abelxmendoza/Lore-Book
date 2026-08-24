export type DiscourseReferentKind = 'entity' | 'exchange' | 'unresolved';

/** A pronoun/demonstrative resolved to a specific person/place — "she" -> "Wren". */
export type EntityReferent = {
  kind: 'entity';
  pronoun: string;
  entityName: string;
  confidence: number;
};

/** A demonstrative resolved to a prior TOPIC or EXCHANGE, not a single entity — "that conversation" -> "our conversation about Jerry", not "Jerry". */
export type ExchangeReferent = {
  kind: 'exchange';
  pronoun: string;
  topicSummary: string;
  involvedEntities: string[];
  confidence: number;
};

export type DiscourseResolution = { kind: 'unresolved' } | EntityReferent | ExchangeReferent;
