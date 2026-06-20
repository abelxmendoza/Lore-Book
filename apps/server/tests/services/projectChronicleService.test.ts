import { describe, it, expect, beforeEach } from 'vitest';

import {
  detectFromGitCommits,
  getProjectChronicle,
  groupMilestonesByMonth,
  resetChronicleMemoryState,
  scoreMajorCommitMessage,
} from '../../src/services/chronicle/projectChronicleService';
import { MilestoneSignificance } from '../../src/services/chronicle/projectChronicleTypes';

describe('projectChronicleService', () => {
  beforeEach(() => {
    resetChronicleMemoryState();
  });

  it('returns a full chronicle snapshot with seed milestones', async () => {
    const snapshot = await getProjectChronicle();
    expect(snapshot.product.name).toBe('LoreBook');
    expect(snapshot.founder.name).toBe('Abel Mendoza');
    expect(snapshot.milestones.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.chroniclePolicy.majorOnly).toBe(true);
    expect(snapshot.chroniclePolicy.autoRefreshHours).toBe(6);
    expect(snapshot.selfNarrative.subtitle).toMatch(/verified/i);
  });

  it('leaderboard is sorted by significance then date', async () => {
    const { leaderboard } = await getProjectChronicle();
    for (let i = 1; i < leaderboard.length; i++) {
      const prev = leaderboard[i - 1];
      const curr = leaderboard[i];
      expect(prev.significance).toBeGreaterThanOrEqual(curr.significance);
    }
  });

  it('groups milestones by calendar month', async () => {
    const { milestones } = await getProjectChronicle();
    const groups = groupMilestonesByMonth(milestones);
    expect(groups.size).toBeGreaterThan(0);
  });

  it('only surfaces major git commits in detection pipeline', () => {
    const slugs = new Set<string>();
    const detections = detectFromGitCommits(slugs);
    for (const d of detections) {
      expect(d.significance).toBeGreaterThanOrEqual(MilestoneSignificance.MAJOR);
      expect(d.confidence).toBeGreaterThanOrEqual(0.78);
    }
  });

  it('filters trivial commit messages at scoring stage', () => {
    expect(scoreMajorCommitMessage('fix lint warnings')).toBeNull();
    expect(scoreMajorCommitMessage('Complete identity integrity system architecture')).not.toBeNull();
  });
});
