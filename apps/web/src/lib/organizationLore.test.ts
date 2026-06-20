import { describe, it, expect } from 'vitest';

import {
  readOrganizationWorld,
  deriveOrganizationWorld,
  importanceStars,
  impactBand,
  vanguardRoboticsWorld,
  type OrgWorldInput,
} from './organizationLore';

const baseOrg = (overrides: Partial<OrgWorldInput> = {}): OrgWorldInput => ({
  name: 'Test Org',
  group_type: 'company',
  user_relationship: 'member',
  status: 'active',
  member_count: 4,
  ...overrides,
});

describe('importanceStars', () => {
  it('maps a 0–100 score to 1–5 stars (clamped)', () => {
    expect(importanceStars(0)).toBe(1); // clamped to a minimum of 1 star
    expect(importanceStars(50)).toBe(3);
    expect(importanceStars(100)).toBe(5);
    expect(importanceStars(90)).toBe(5);
  });

  it('defaults to 3 for missing/invalid input (error handling)', () => {
    expect(importanceStars(undefined)).toBe(3);
    expect(importanceStars(null)).toBe(3);
    expect(importanceStars(NaN)).toBe(3);
  });
});

describe('impactBand', () => {
  it('returns qualitative bands across the thresholds', () => {
    expect(impactBand(88)).toBe('Foundational');
    expect(impactBand(65)).toBe('Significant');
    expect(impactBand(40)).toBe('Moderate');
    expect(impactBand(10)).toBe('Light');
  });
});

describe('deriveOrganizationWorld', () => {
  it('is deterministic and fully populated', () => {
    const a = deriveOrganizationWorld(baseOrg());
    const b = deriveOrganizationWorld(baseOrg());
    expect(a).toEqual(b);
    expect(a.derived).toBe(true);
    expect(a.archetype.nickname).toBe('The Forge'); // company preset
    expect(a.lore.themes.length).toBeGreaterThan(0);
    expect(a.influence.skillsGained.length).toBeGreaterThan(0);
    expect(a.insights.length).toBeGreaterThan(0);
  });

  it('prefers analytics influence for the impact score, then importance', () => {
    expect(
      deriveOrganizationWorld(baseOrg({ analytics: { group_influence_on_user: 73 } })).influence.impactScore
    ).toBe(73);
    expect(
      deriveOrganizationWorld(baseOrg({ analytics: { importance_score: 61 } })).influence.impactScore
    ).toBe(61);
  });

  it('falls back to a generic archetype for unknown group types', () => {
    const world = deriveOrganizationWorld(baseOrg({ group_type: 'something_unmapped' }));
    expect(world.archetype.nickname).toBe('The Waypoint'); // 'other' preset
  });

  it('emits a trend insight reflecting the analytics trend', () => {
    const rising = deriveOrganizationWorld(baseOrg({ analytics: { trend: 'increasing' } }));
    expect(rising.insights.some((i) => i.kind === 'trend' && /rising/i.test(i.text))).toBe(true);
  });
});

describe('readOrganizationWorld', () => {
  it('returns the curated Vanguard Robotics world by name (case-insensitive)', () => {
    expect(readOrganizationWorld({ name: 'Vanguard Robotics' })).toBe(vanguardRoboticsWorld);
    expect(readOrganizationWorld({ name: '  vanguard robotics  ' })).toBe(vanguardRoboticsWorld);
    expect(readOrganizationWorld({ name: 'Vanguard Robotics' }).derived).toBe(false);
  });

  it('lets an explicit metadata.world override curated/derived content', () => {
    const custom = deriveOrganizationWorld(baseOrg({ name: 'Vanguard Robotics' }));
    custom.archetype = { ...custom.archetype, nickname: 'Custom Name' };
    const result = readOrganizationWorld({
      name: 'Vanguard Robotics',
      metadata: { world: custom },
    });
    expect(result.archetype.nickname).toBe('Custom Name');
  });

  it('derives a world for an unknown organization', () => {
    const result = readOrganizationWorld(baseOrg({ name: 'Northwind Co' }));
    expect(result.derived).toBe(true);
    expect(result.archetype.nickname).toBe('The Forge');
  });
});
