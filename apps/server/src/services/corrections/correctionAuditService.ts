import { randomUUID } from 'crypto';
import type { CorrectionAuditRecord, CorrectedPreviewSpan, CorrectionLinkAuditEntry } from './correctionTypes';

const auditLog: CorrectionAuditRecord[] = [];

function buildLinkEntries(
  messageId: string,
  corrections: CorrectedPreviewSpan[]
): CorrectionLinkAuditEntry[] {
  const now = new Date().toISOString();
  return corrections
    .filter((c) => c.linkedEntityId && (c.correctionAction === 'link_existing_entity' || c.correctionAction === 'link_existing'))
    .map((c) => ({
      spanText: c.text,
      originalType: c.originalType,
      linkedEntityId: c.linkedEntityId!,
      linkedEntityType: c.linkedEntityType ?? 'unknown',
      selectedByUser: true as const,
      timestamp: now,
      messageId,
      ...(c.correctedType && c.correctedType !== c.originalType
        ? { typeConflict: true }
        : {}),
    }));
}

export function recordCorrectionAudit(input: {
  userId: string;
  messageId: string;
  threadId?: string;
  corrections: CorrectedPreviewSpan[];
}): CorrectionAuditRecord {
  const linkEntries = buildLinkEntries(input.messageId, input.corrections);
  const record: CorrectionAuditRecord = {
    auditId: randomUUID(),
    userId: input.userId,
    messageId: input.messageId,
    threadId: input.threadId,
    correctionCount: input.corrections.length,
    actions: [...new Set(input.corrections.map((c) => c.correctionAction))],
    ...(linkEntries.length ? { linkEntries } : {}),
    createdAt: new Date().toISOString(),
  };
  auditLog.push(record);
  if (auditLog.length > 500) auditLog.shift();
  return record;
}

export function getCorrectionAudit(auditId: string): CorrectionAuditRecord | undefined {
  return auditLog.find((a) => a.auditId === auditId);
}

/** Test helper */
export function clearCorrectionAuditLog(): void {
  auditLog.length = 0;
}
