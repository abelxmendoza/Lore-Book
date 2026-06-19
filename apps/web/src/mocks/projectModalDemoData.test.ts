import { describe, it, expect } from 'vitest';
import {
  enrichProjectForDemo,
  getProjectDetailProfile,
} from './projectModalDemoData';
import type { ProjectCardData } from '../components/projects/ProjectProfileCard';

const base: ProjectCardData = {
  id: 'p1',
  name: 'LoreBook',
  type: 'software',
  status: 'active',
  description: 'Memory app',
  tags: ['code'],
  updated_at: new Date().toISOString(),
};

describe('projectModalDemoData', () => {
  it('returns rich LoreBook profile in demo mode', () => {
    const profile = getProjectDetailProfile(base, true);
    expect(profile.milestones.length).toBeGreaterThan(3);
    expect(profile.contributors.length).toBeGreaterThan(0);
    expect(profile.skills.some((s) => s.name === 'TypeScript')).toBe(true);
    expect(profile.brief.nextStep).toBeTruthy();
  });

  it('enriches project with dates and summary', () => {
    const enriched = enrichProjectForDemo({ ...base, started_at: null });
    expect(enriched.started_at).toBeTruthy();
    expect(enriched.summary).toContain('biographer');
  });

  it('builds lifecycle-aware milestones for paused projects', () => {
    const profile = getProjectDetailProfile(
      { ...base, name: 'Side project', status: 'paused' },
      true
    );
    expect(profile.milestones.some((m) => m.kind === 'pause')).toBe(true);
    expect(profile.currentPhase.toLowerCase()).toContain('hold');
  });

  it('builds end milestone for completed projects', () => {
    const profile = getProjectDetailProfile(
      { ...base, name: 'Done thing', status: 'completed' },
      true
    );
    expect(profile.milestones.some((m) => m.kind === 'end')).toBe(true);
  });
});
