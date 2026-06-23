export type CanonicalIdentityDomain =
  | 'person'
  | 'place'
  | 'group'
  | 'organization'
  | 'event'
  | 'timeline_anchor'
  | 'relationship';

export type CanonicalIdentityStatus =
  | 'accepted'
  | 'rejected'
  | 'duplicate'
  | 'needs_context'
  | 'needs_review';

export type CanonicalIdentityRecord = {
  id?: string;
  canonicalIdentity: string;
  displayName: string;
  domain: CanonicalIdentityDomain;
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

export type CanonicalIdentityInput = {
  rawText: string;
  domain: CanonicalIdentityDomain;
  contextText?: string;
  existingIdentities?: CanonicalIdentityRecord[];
  sourceMessageIds?: string[];
};

export type CanonicalIdentityResult = {
  status: CanonicalIdentityStatus;
  domain: CanonicalIdentityDomain;
  canonicalIdentity?: string;
  displayName?: string;
  aliases: string[];
  duplicateOf?: CanonicalIdentityRecord;
  confidence: number;
  rejectionReason?: string;
  requiresReview: boolean;
  rulesFired: string[];
  evidencePhrases: string[];
  sourceMessageIds: string[];
  metadata: Record<string, unknown>;
};

export type CanonicalContextSource = {
  preposition: 'from' | 'at' | 'with' | 'in';
  label: string;
  kind: 'person' | 'place' | 'group' | 'organization' | 'event' | 'unknown';
};
