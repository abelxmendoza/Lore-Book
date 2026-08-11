import { beforeEach, describe, expect, it } from 'vitest';
import { resetDemoEditionFixturesForTests } from '../lib/storyForge/demoEditionFixtures';
import {
  compareDemoVersions,
  getDemoManifest,
  getDemoVersionHistory,
} from './demoBookVersioning';

describe('demoBookVersioning', () => {
  beforeEach(() => {
    resetDemoEditionFixturesForTests();
  });

  it('returns Vanguard career edition history with published + superseded statuses', () => {
    const { versions } = getDemoVersionHistory('Career at Vanguard Robotics');
    expect(versions.length).toBe(3);
    expect(versions[0].lorebookVersion).toBe(3);
    expect(versions[0].status).toBe('published');
    expect(versions[1].status).toBe('superseded');
    expect(versions[2].lorebookVersion).toBe(1);
  });

  it('returns a manifest for an edition id', () => {
    const { versions } = getDemoVersionHistory('Career at Vanguard Robotics');
    const result = getDemoManifest(versions[0].id);
    expect(result?.manifest.lorebookVersion).toBe(3);
    expect(result?.manifest.publicationHandle).toBe('Career at Vanguard Robotics');
    expect(result?.manifest.knowledgeSnapshot.atomCount).toBeGreaterThan(0);
  });

  it('compares editions and reports chapter adds / changes', () => {
    const { versions } = getDemoVersionHistory('Career at Vanguard Robotics');
    const v1 = versions.find((v) => v.lorebookVersion === 1)!;
    const v2 = versions.find((v) => v.lorebookVersion === 2)!;
    const result = compareDemoVersions(v1.id, v2.id);
    expect(result).toBeTruthy();
    expect(result!.comparison.differences.some((d) => d.changeType === 'added')).toBe(true);
    expect(result!.comparison.metadataChanges.length).toBeGreaterThan(0);
  });

  it('includes Jamie & Marcus relationship lineage', () => {
    const { versions } = getDemoVersionHistory('Relationships — Jamie & Marcus');
    expect(versions.length).toBe(2);
    expect(versions[0].title).toContain('Jamie');
  });
});
