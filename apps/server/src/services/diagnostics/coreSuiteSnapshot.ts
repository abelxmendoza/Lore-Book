/**
 * In-memory snapshot of the last core diagnostics suite run.
 * Used so LoreBook can answer light "are you working?" questions from admin health.
 */

export type CoreSuiteStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export type CoreSuiteSnapshot = {
  runId: string;
  status: CoreSuiteStatus;
  completedAt: string;
  durationMs: number;
  summary: Record<CoreSuiteStatus, number>;
  suites: Array<{ id: string; name: string; status: CoreSuiteStatus; detail?: string }>;
  /** Full check list from last run (optional for chat status answers). */
  checks?: Array<{
    id: string;
    name: string;
    suite: string;
    status: CoreSuiteStatus;
    durationMs: number;
    expected: string;
    actual: string;
    fixHint?: string;
  }>;
  startedAt?: string;
};

let lastSnapshot: CoreSuiteSnapshot | null = null;

export function setCoreSuiteSnapshot(snapshot: CoreSuiteSnapshot | null): void {
  lastSnapshot = snapshot;
}

export function getCoreSuiteSnapshot(): CoreSuiteSnapshot | null {
  return lastSnapshot;
}
