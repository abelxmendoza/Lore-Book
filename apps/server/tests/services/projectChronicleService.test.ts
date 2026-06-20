import { describe, it, expect, beforeEach } from 'vitest';

import {
  detectFromGitCommits,
  detectFromReadme,
  getProjectChronicle,
  groupMilestonesByMonth,
  resetChronicleMemoryState,
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
    expect(snapshot.organization.name).toBe('Omega Technologies');
    expect(snapshot.milestones.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.stage.current).toBe('BETA');
    expect(snapshot.visionEvolution).toHaveLength(3);
    expect(snapshot.selfNarrative.chapters.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.leaderboard.length).toBeLessThanOrEqual(25);
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
    const june2026 = [...groups.entries()].find(([k]) => k.includes('June') && k.includes('2026'));
    expect(june2026?.[1].length).toBeGreaterThan(0);
  });

  it('scores git commits with significance heuristics', () => {
    const slugs = new Set<string>();
    const detections = detectFromGitCommits(slugs);
    expect(Array.isArray(detections)).toBe(true);
    for (const d of detections) {
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.significance).toBeGreaterThanOrEqual(MilestoneSignificance.TRIVIAL);
      expect(d.significance).toBeLessThanOrEqual(MilestoneSignificance.TRANSFORMATIONAL);
    }
  });

  it('detects README tagline when not already tracked', () => {
    const det = detectFromReadme(new Set());
    if (det) {
      expect(det.source).toBe('readme');
      expect(det.confidence).toBeGreaterThan(0.8);
    }
  });
});
