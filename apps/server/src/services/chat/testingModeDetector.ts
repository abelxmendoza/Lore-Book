/**
 * Sprint AH — Testing / Diagnostic Mode Detection (Phase 3)
 */

export type TestingModeKind =
  | 'memory_formation'
  | 'recall_check'
  | 'system_state'
  | 'general_diagnostic';

export const TESTING_MODE_RE =
  /\b(testing|test mode|diagnostic|system state|what do you know|what have you stored|what did you (save|record|capture|create|make)|did you (save|record|remember|capture|create|make|store)|have you (saved|recorded|remembered|captured|created|stored)|do you remember|did you make a character|did you create a card|is .+ in (the )?(system|database|lorebook)|show me what you (have|know|saved|stored))\b/i;

export const MEMORY_FORMATION_RE =
  /\b(did you save|have you saved|is .+ saved|did you (create|make) (a |the )?(character|card|entry|record)|memory formation|what do you have (on|for|about)|what did you store (about|for))\b/i;

export function detectTestingMode(message: string): TestingModeKind | null {
  const text = message.trim();
  if (!TESTING_MODE_RE.test(text)) return null;

  if (MEMORY_FORMATION_RE.test(text)) return 'memory_formation';
  if (/\b(what do you know|what have you (learned|stored)|recall everything)\b/i.test(text)) {
    return 'recall_check';
  }
  if (/\b(testing|diagnostic|system state)\b/i.test(text)) return 'system_state';
  return 'general_diagnostic';
}

export function isTestingModeMessage(message: string): boolean {
  return detectTestingMode(message) !== null;
}

export const RECALL_FAILURE_RE =
  /\b(you forgot|still not working|you don'?t remember|bad sign|you lost|that didn'?t work|you missed|you failed|why can'?t you remember|you never remember)\b/i;

export function detectRecallFailure(message: string): boolean {
  return RECALL_FAILURE_RE.test(message.trim());
}

/**
 * Diagnostic mode system instructions — no therapist redirect.
 */
export function buildDiagnosticSystemNote(kind: TestingModeKind): string {
  return [
    'DIAGNOSTIC MODE — answer system-state questions directly.',
    'Do not ask reflective follow-up questions.',
    'Do not redirect to feelings or therapy.',
    'Report verified stored data only — never claim memory exists without evidence.',
    `Mode: ${kind}`,
  ].join('\n');
}
