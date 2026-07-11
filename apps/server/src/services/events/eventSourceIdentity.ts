/**
 * Deterministic source identity for event artifacts.
 * Used to prevent duplicate logical events on ingestion replay.
 */
import { createHash } from 'crypto';

export const EVENT_EXTRACTOR_VERSION = 'v1';

export function buildEventSourceFingerprint(parts: {
  userId: string;
  sourceMessageId: string;
  extractorVersion?: string;
  artifactType?: string;
  /** Normalized title / subject for multi-event messages */
  subject?: string;
}): string {
  const material = [
    parts.userId,
    parts.sourceMessageId,
    parts.extractorVersion ?? EVENT_EXTRACTOR_VERSION,
    parts.artifactType ?? 'resolved_event',
    (parts.subject ?? '').toLowerCase().trim().replace(/\s+/g, ' '),
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 40);
}

/** Fingerprint from knowledge unit ids (assembly path). */
export function buildAssemblyFingerprint(parts: {
  userId: string;
  unitIds: string[];
  extractorVersion?: string;
}): string {
  const sorted = [...parts.unitIds].filter(Boolean).sort();
  const material = [
    parts.userId,
    parts.extractorVersion ?? EVENT_EXTRACTOR_VERSION,
    'assembly',
    sorted.join(','),
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 40);
}
