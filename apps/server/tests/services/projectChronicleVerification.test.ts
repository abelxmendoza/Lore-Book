import { describe, it, expect } from 'vitest';

import { MilestoneSignificance } from '../../src/services/chronicle/projectChronicleTypes';
import {
  scoreMajorCommitMessage,
  shouldAutoPromote,
  shouldQueuePending,
  verifyGitCommitProgress,
} from '../../src/services/chronicle/projectChronicleVerification';

describe('projectChronicleVerification', () => {
  it('ignores noise commits', () => {
    expect(scoreMajorCommitMessage('fix typo in admin header')).toBeNull();
    expect(scoreMajorCommitMessage('chore: bump deps')).toBeNull();
    expect(scoreMajorCommitMessage('polish mobile responsive layout')).toBeNull();
  });

  it('scores major architecture commits', () => {
    const score = scoreMajorCommitMessage('Complete provenance system architecture shift');
    expect(score).not.toBeNull();
    expect(score!.significance).toBeGreaterThanOrEqual(MilestoneSignificance.MAJOR);
    expect(score!.confidence).toBeGreaterThanOrEqual(0.86);
  });

  it('rejects cosmetic-only verification', () => {
    const result = verifyGitCommitProgress(
      'deadbeef',
      'polish css',
      new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    );
    expect(result.confirmed).toBe(false);
    expect(result.eligibleForPending).toBe(false);
  });

  it('requires settling period before auto-promote eligibility', () => {
    const recent = verifyGitCommitProgress(
      'deadbeef',
      'Ship narrative engine architecture',
      new Date().toISOString(),
    );
    expect(recent.confirmed).toBe(false);
    expect(recent.reasons.some((r) => r.includes('Settling'))).toBe(true);
  });

  it('auto-promote gate requires high confidence and verification', () => {
    const detection = {
      id: 'd1',
      title: 'Ship narrative engine architecture',
      summary: 'test',
      confidence: 0.9,
      significance: MilestoneSignificance.MAJOR,
      category: 'architecture' as const,
      source: 'git_commit' as const,
      sourceRef: 'abc',
      detectedAt: new Date().toISOString(),
      status: 'pending' as const,
    };
    const verification = {
      confirmed: true,
      score: 0.8,
      reasons: ['Tests updated alongside implementation'],
      eligibleForPending: true,
      eligibleForAutoPromote: true,
    };
    expect(shouldAutoPromote(detection, verification)).toBe(true);
    expect(shouldQueuePending(detection, verification)).toBe(true);
  });

  it('does not queue moderate-significance detections', () => {
    const detection = {
      id: 'd2',
      title: 'Add button',
      summary: 'test',
      confidence: 0.95,
      significance: MilestoneSignificance.MODERATE,
      category: 'other' as const,
      source: 'git_commit' as const,
      detectedAt: new Date().toISOString(),
      status: 'pending' as const,
    };
    const verification = {
      confirmed: true,
      score: 0.9,
      reasons: [],
      eligibleForPending: true,
      eligibleForAutoPromote: true,
    };
    expect(shouldQueuePending(detection, verification)).toBe(false);
  });
});
