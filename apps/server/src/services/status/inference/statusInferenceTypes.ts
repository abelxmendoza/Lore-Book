/** Status / state / lifecycle inference — metadata on entities, never overwrites history. */

export type StatusAttachedToType =
  | 'person'
  | 'relationship'
  | 'project'
  | 'quest_log_item'
  | 'work_role'
  | 'skill'
  | 'event'
  | 'group'
  | 'narrative_anchor';

export type StatusValue =
  | 'active'
  | 'paused'
  | 'dormant'
  | 'ended'
  | 'former'
  | 'current'
  | 'blocked'
  | 'pending'
  | 'confirmed'
  | 'planned'
  | 'completed'
  | 'uncertain'
  | 'needs_review';

export type StatusTransition =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'ended'
  | 'revived'
  | 'blocked'
  | 'confirmed'
  | 'completed';

export type StatusSignal = {
  attachedToType: StatusAttachedToType;
  attachedToId?: string;
  inferredTitle?: string;
  status: StatusValue;
  transition?: StatusTransition;
  timeHint?: string;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
};

export type LifecycleEntry = {
  entityKey: string;
  attachedToType: StatusAttachedToType;
  inferredTitle: string;
  status: StatusValue;
  transition?: StatusTransition;
  timeHint?: string;
  evidencePhrases: string[];
  sourceMessageIds: string[];
  recordedAt?: string;
};

export type StatusInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  priorLifecycle?: Record<string, LifecycleEntry[]>;
  seenAt?: string;
};

export type StatusInferenceResult = {
  accepted: StatusSignal[];
  rejected: Array<{ inferredTitle: string; reason: string }>;
  lifecycle: LifecycleEntry[];
};

export type EntityLifecycleState = Record<string, LifecycleEntry[]>;
