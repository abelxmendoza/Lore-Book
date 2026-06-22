import type { TruthStateAuditEntry } from './truthStateTypes';

const auditLog: TruthStateAuditEntry[] = [];

export function recordAudit(entry: TruthStateAuditEntry): void {
  auditLog.push(entry);
}

export function recordAudits(entries: TruthStateAuditEntry[]): void {
  auditLog.push(...entries);
}

export function getAuditForClaim(claimId: string): TruthStateAuditEntry[] {
  return auditLog.filter((e) => e.claimId === claimId);
}

export function getAuditHistory(): TruthStateAuditEntry[] {
  return [...auditLog];
}

export function clearAuditForTests(): void {
  auditLog.length = 0;
}

export function auditPreservesHistory(claimId: string): boolean {
  const entries = getAuditForClaim(claimId);
  if (entries.length === 0) return true;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].fromState !== entries[i - 1].toState) return false;
  }
  return true;
}

export function summarizeAudit(claimId: string): string[] {
  return getAuditForClaim(claimId).map(
    (e) => `${e.fromState} → ${e.toState} (${e.reason})`,
  );
}
