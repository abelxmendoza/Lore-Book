/**
 * Deterministic source identity for autobiographical meaning artifacts.
 */
import { createHash } from 'crypto';

export const MEMORY_QUALITY_EXTRACTOR_VERSION = 'memory-quality-v2';

export type MeaningType =
  | 'lesson'
  | 'behavior_change'
  | 'identity_growth'
  | 'motivation'
  | 'intent'
  | 'outcome'
  | 'future_implication'
  | 'causal_link'
  | 'continuity_link'
  | 'progression'
  | 'relationship_dimension'
  | 'preference_lifecycle'
  | 'emotion';

export type EpistemicType =
  | 'direct_statement'
  | 'deterministic_inference'
  | 'multi_evidence_pattern'
  | 'user_confirmed'
  | 'user_corrected';

export function normalizeMeaningValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s'.-]/g, '')
    .slice(0, 200);
}

export function buildMeaningFingerprint(parts: {
  userId: string;
  sourceMessageId: string;
  sourceEventId?: string | null;
  meaningType: MeaningType | string;
  normalizedValue: string;
  subjectEntityId?: string | null;
  objectEntityId?: string | null;
  extractorVersion?: string;
}): string {
  const material = [
    parts.userId,
    parts.sourceMessageId,
    parts.sourceEventId ?? '',
    parts.meaningType,
    normalizeMeaningValue(parts.normalizedValue),
    parts.subjectEntityId ?? '',
    parts.objectEntityId ?? '',
    parts.extractorVersion ?? MEMORY_QUALITY_EXTRACTOR_VERSION,
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 48);
}
