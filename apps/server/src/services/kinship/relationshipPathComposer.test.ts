import { describe, expect, it } from 'vitest';
import {
  composeRelation,
  relationNeedsSex,
  sidewaysStepCount,
  stepFromEdge,
  type PathStep,
} from './relationshipPathComposer';

describe('stepFromEdge', () => {
  it('classifies parent_of/child_of by travel direction', () => {
    expect(stepFromEdge('parent_of', 'forward')).toBe('DOWN');
    expect(stepFromEdge('parent_of', 'backward')).toBe('UP');
    expect(stepFromEdge('child_of', 'forward')).toBe('UP');
    expect(stepFromEdge('child_of', 'backward')).toBe('DOWN');
  });

  it('classifies sibling-family edges as SIDE regardless of direction', () => {
    for (const type of ['sibling_of', 'twin_of', 'half_sibling_of', 'step_sibling_of']) {
      expect(stepFromEdge(type, 'forward')).toBe('SIDE');
      expect(stepFromEdge(type, 'backward')).toBe('SIDE');
    }
  });

  it('classifies spouse_of as MARRY', () => {
    expect(stepFromEdge('spouse_of', 'forward')).toBe('MARRY');
  });

  it('does not decompose compound/explicit edge types', () => {
    for (const type of ['aunt_of', 'cousin_of', 'grandparent_of', 'step_parent_of', 'in_law_of', 'godparent_of']) {
      expect(stepFromEdge(type, 'forward')).toBeNull();
    }
  });
});

describe('composeRelation', () => {
  it('direct relations are unchanged from single-hop behavior', () => {
    expect(composeRelation(['UP'], null)).toBe('parent');
    expect(composeRelation(['DOWN'], null)).toBe('child');
    expect(composeRelation(['SIDE'], null)).toBe('sibling');
    expect(composeRelation(['MARRY'], null)).toBe('spouse');
  });

  it('two-generation direct chains compose to grandparent/grandchild', () => {
    expect(composeRelation(['UP', 'UP'], null)).toBe('grandparent');
    expect(composeRelation(['DOWN', 'DOWN'], null)).toBe('grandchild');
  });

  it('a parent’s other child (no direct sibling_of edge) composes to sibling', () => {
    expect(composeRelation(['UP', 'DOWN'], null)).toBe('sibling');
  });

  it('parent + sibling composes to aunt/uncle by resolved sex — the core bug fix', () => {
    expect(composeRelation(['UP', 'SIDE'], 'female')).toBe('aunt');
    expect(composeRelation(['UP', 'SIDE'], 'male')).toBe('uncle');
  });

  it('sibling + child composes to niece/nephew by resolved sex', () => {
    expect(composeRelation(['SIDE', 'DOWN'], 'female')).toBe('niece');
    expect(composeRelation(['SIDE', 'DOWN'], 'male')).toBe('nephew');
  });

  it('parent + sibling + child composes to cousin (sex-independent)', () => {
    expect(composeRelation(['UP', 'SIDE', 'DOWN'], null)).toBe('cousin');
  });

  it('falls back to related instead of guessing when sex is unknown', () => {
    expect(composeRelation(['UP', 'SIDE'], null)).toBe('related');
    expect(composeRelation(['SIDE', 'DOWN'], null)).toBe('related');
  });

  it('falls back to related for unrecognized/longer paths (e.g. great-grandparent)', () => {
    expect(composeRelation(['UP', 'UP', 'UP'], null)).toBe('related');
    expect(composeRelation(['UP', 'UP', 'SIDE'], 'female')).toBe('related');
    expect(composeRelation([], null)).toBe('related');
  });
});

describe('relationNeedsSex', () => {
  it('flags only the aunt/uncle and niece/nephew paths', () => {
    expect(relationNeedsSex(['UP', 'SIDE'])).toBe(true);
    expect(relationNeedsSex(['SIDE', 'DOWN'])).toBe(true);
    expect(relationNeedsSex(['UP'])).toBe(false);
    expect(relationNeedsSex(['UP', 'SIDE', 'DOWN'])).toBe(false);
  });
});

describe('sidewaysStepCount — tie-break helper', () => {
  it('counts SIDE and MARRY steps, ignoring UP/DOWN', () => {
    const path: PathStep[] = ['UP', 'SIDE', 'DOWN', 'MARRY'];
    expect(sidewaysStepCount(path)).toBe(2);
    expect(sidewaysStepCount(['UP', 'UP'])).toBe(0);
  });
});
