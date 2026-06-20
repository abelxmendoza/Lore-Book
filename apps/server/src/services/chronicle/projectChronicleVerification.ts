import { execSync } from 'node:child_process';
import { join } from 'node:path';

import {
  COMMIT_SETTLING_MS,
  MIN_AUTO_PROMOTE_CONFIDENCE,
  MIN_PENDING_CONFIDENCE,
  MIN_PIPELINE_SIGNIFICANCE,
  MIN_VERIFICATION_SCORE,
} from './projectChroniclePolicy';
import {
  DetectionSource,
  MilestoneCategory,
  MilestoneSignificance,
  PendingDetection,
} from './projectChronicleTypes';

const REPO_ROOT = join(__dirname, '../../../../..');

export interface CommitScore {
  significance: MilestoneSignificance;
  category: MilestoneCategory;
  confidence: number;
}

export interface VerificationResult {
  confirmed: boolean;
  score: number;
  reasons: string[];
  eligibleForPending: boolean;
  eligibleForAutoPromote: boolean;
}

const NOISE_MESSAGE =
  /\b(chore|wip|work in progress|bump|deps|dependency|typo|lint|format|prettier|eslint|polish|responsive|css only|merge branch|merge pull|revert|fix test|test fix)\b/i;

const COMPLETION_MESSAGE =
  /\b(complete|completed|shipped|launch|launched|release|released|production|migration|e2e|integration test|verified working)\b/i;

const MAJOR_SIGNALS: Array<{
  pattern: RegExp;
  significance: MilestoneSignificance;
  category: MilestoneCategory;
  confidence: number;
}> = [
  {
    pattern: /\b(breakthrough|transformational|architecture shift|narrative intelligence operating system)\b/i,
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.ARCHITECTURE,
    confidence: 0.92,
  },
  {
    pattern: /\b(provenance system|identity integrity|narrative engine|narrative spine|cognition graph|lore agents|chronicle engine)\b/i,
    significance: MilestoneSignificance.TRANSFORMATIONAL,
    category: MilestoneCategory.TECHNICAL_BREAKTHROUGH,
    confidence: 0.9,
  },
  {
    pattern: /\b(major refactor|architecture|orchestrat|platform release)\b/i,
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.ARCHITECTURE,
    confidence: 0.86,
  },
  {
    pattern: /\b(shipped|launched|completed)\b.*\b(system|engine|architecture|platform|dashboard)\b/i,
    significance: MilestoneSignificance.MAJOR,
    category: MilestoneCategory.NEW_CAPABILITY,
    confidence: 0.88,
  },
];

const SUBSTANTIVE_PREFIXES = [
  'apps/server/src/',
  'apps/web/src/',
  'supabase/migrations/',
];

function isTestFile(path: string): boolean {
  return (
    path.includes('/tests/') ||
    path.includes('.test.') ||
    path.includes('.spec.') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx')
  );
}

function isCosmeticFile(path: string): boolean {
  return path.endsWith('.css') || path.endsWith('.md') || path.endsWith('.json') && path.includes('package');
}

export function getCommitChangedFiles(hash: string): string[] {
  if (!hash) return [];
  try {
    const out = execSync(
      ['git', 'show', '--name-only', '--pretty=format:', hash],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 },
    );
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Score a commit message — returns null when not major enough for the chronicle. */
export function scoreMajorCommitMessage(message: string): CommitScore | null {
  const firstLine = message.split('\n')[0]?.trim() ?? '';
  if (firstLine.length < 12) return null;
  if (NOISE_MESSAGE.test(firstLine)) return null;

  for (const rule of MAJOR_SIGNALS) {
    if (rule.pattern.test(firstLine)) {
      return {
        significance: rule.significance,
        category: rule.category,
        confidence: rule.confidence,
      };
    }
  }

  return null;
}

export function verifyGitCommitProgress(
  hash: string,
  message: string,
  occurredAt: string,
): VerificationResult {
  const reasons: string[] = [];
  let score = 0;

  if (NOISE_MESSAGE.test(message)) {
    return {
      confirmed: false,
      score: 0,
      reasons: ['Filtered: low-signal commit message'],
      eligibleForPending: false,
      eligibleForAutoPromote: false,
    };
  }

  const files = getCommitChangedFiles(hash);
  const substantive = files.filter((f) => SUBSTANTIVE_PREFIXES.some((p) => f.startsWith(p)));
  const tests = files.filter(isTestFile);
  const cosmeticOnly =
    files.length > 0 && files.every((f) => isCosmeticFile(f) || isTestFile(f));

  if (substantive.length > 0) {
    score += 0.35;
    reasons.push(`Substantive changes (${substantive.length} file${substantive.length === 1 ? '' : 's'})`);
  } else {
    reasons.push('No substantive application or migration changes');
  }

  if (tests.length > 0 && substantive.length > 0) {
    score += 0.3;
    reasons.push('Tests updated alongside implementation');
  }

  if (COMPLETION_MESSAGE.test(message)) {
    score += 0.25;
    reasons.push('Completion language in commit message');
  }

  if (files.some((f) => f.startsWith('supabase/migrations/'))) {
    score += 0.15;
    reasons.push('Database migration included');
  }

  if (cosmeticOnly && !COMPLETION_MESSAGE.test(message)) {
    return {
      confirmed: false,
      score: Math.min(score, 0.4),
      reasons: [...reasons, 'Mostly cosmetic changes — not chronicle-worthy'],
      eligibleForPending: false,
      eligibleForAutoPromote: false,
    };
  }

  const ageMs = Date.now() - new Date(occurredAt).getTime();
  const settled = ageMs >= COMMIT_SETTLING_MS;
  if (!settled) {
    reasons.push('Settling period — waiting before auto-recording');
  }

  const confirmed = settled && score >= MIN_VERIFICATION_SCORE && substantive.length > 0;

  return {
    confirmed,
    score,
    reasons,
    eligibleForPending: score >= 0.55 && substantive.length > 0,
    eligibleForAutoPromote: confirmed && score >= MIN_VERIFICATION_SCORE,
  };
}

export function verifyDetection(detection: PendingDetection): VerificationResult {
  if (detection.source === DetectionSource.GIT_COMMIT && detection.sourceRef) {
    const verification = verifyGitCommitProgress(
      detection.sourceRef,
      detection.title,
      detection.detectedAt,
    );
    return verification;
  }

  return {
    confirmed: false,
    score: detection.confidence,
    reasons: ['Manual review required for non-git sources'],
    eligibleForPending: detection.confidence >= MIN_PENDING_CONFIDENCE,
    eligibleForAutoPromote: false,
  };
}

export function shouldQueuePending(
  detection: PendingDetection,
  verification: VerificationResult,
): boolean {
  return (
    detection.significance >= MIN_PIPELINE_SIGNIFICANCE &&
    detection.confidence >= MIN_PENDING_CONFIDENCE &&
    verification.eligibleForPending
  );
}

export function shouldAutoPromote(
  detection: PendingDetection,
  verification: VerificationResult,
): boolean {
  return (
    detection.significance >= MIN_PIPELINE_SIGNIFICANCE &&
    detection.confidence >= MIN_AUTO_PROMOTE_CONFIDENCE &&
    verification.eligibleForAutoPromote &&
    verification.confirmed
  );
}
