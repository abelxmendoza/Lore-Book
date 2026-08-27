import { describe, expect, it } from 'vitest';
import { planEpithetPrimaryNameRepair, planSelfIdentityPresentationCleanup } from './epithetPrimaryNameRepair';

describe('planEpithetPrimaryNameRepair', () => {
  it('moves epithet into alias + contextual_title', () => {
    const plan = planEpithetPrimaryNameRepair({
      name: 'Aunt Maribel the Hallway Guardian',
      alias: ['Aunt Maribel'],
      metadata: {},
    });
    expect(plan.needsRepair).toBe(true);
    expect(plan.name).toBe('Aunt Maribel');
    expect(plan.epithet).toBe('Hallway Guardian');
    expect(plan.metadata.epithet).toBe('Hallway Guardian');
    expect(plan.metadata.contextual_title).toBe('Hallway Guardian');
    expect(plan.alias).toEqual(
      expect.arrayContaining([
        'Aunt Maribel',
        'Hallway Guardian',
        'Aunt Maribel the Hallway Guardian',
      ]),
    );
  });

  it('is a no-op when name is already clean', () => {
    const plan = planEpithetPrimaryNameRepair({
      name: 'Aunt Maribel',
      alias: ['Hallway Guardian'],
      metadata: { contextual_title: 'Hallway Guardian' },
    });
    expect(plan.needsRepair).toBe(false);
    expect(plan.name).toBe('Aunt Maribel');
  });
});

describe('planSelfIdentityPresentationCleanup', () => {
  it('disables unpinned theme epithets and drops composed aliases', () => {
    const plan = planSelfIdentityPresentationCleanup({
      name: 'Jamie Rivera',
      alias: [
        'Jamie',
        'Isolation And Resilience',
        'Jamie Rivera the Isolation And Resilience',
      ],
      metadata: { is_self: true, epithet: 'Isolation And Resilience' },
    });
    expect(plan.needsRepair).toBe(true);
    expect(plan.metadata.epithet_disabled).toBe(true);
    expect(plan.alias).toEqual(['Jamie']);
  });

  it('keeps a pinned epithet on the protagonist', () => {
    const plan = planSelfIdentityPresentationCleanup({
      name: 'Jamie Rivera',
      alias: ['Jamie', 'Hallway Guardian'],
      metadata: { is_self: true, epithet: 'Hallway Guardian', epithet_pinned: true },
    });
    expect(plan.needsRepair).toBe(false);
    expect(plan.alias).toEqual(['Jamie', 'Hallway Guardian']);
  });
});
