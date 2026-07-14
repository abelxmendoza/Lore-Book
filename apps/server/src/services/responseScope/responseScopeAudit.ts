/**
 * Scope audit — records what the gate allowed/blocked for each answer so the
 * debug inspector can explain retrieval decisions WITHOUT that explanation
 * ever leaking into normal chat.
 */

import { logger } from '../../logger';
import type { ResponseScopeAuditRecord } from './responseScopeTypes';

const MAX_RECORDS = 200;
const records: ResponseScopeAuditRecord[] = [];

export function recordScopeAudit(record: ResponseScopeAuditRecord): void {
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  logger.info(
    {
      userId: record.userId,
      intent: record.plan.intent,
      responseMode: record.plan.responseMode,
      accepted: record.acceptedCount,
      rejected: record.rejectedCount,
      overflow: record.overflowViolations,
    },
    'response scope gate applied',
  );
}

export function getRecentScopeAudits(userId?: string, limit = 20): ResponseScopeAuditRecord[] {
  const filtered = userId ? records.filter((r) => r.userId === userId) : records;
  return filtered.slice(-limit).reverse();
}
