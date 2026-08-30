import { describe, expect, it } from 'vitest';
import { isDurableLifeArc, selectProfileLifeArcs } from './durableLifeArcs';

describe('durableLifeArcs', () => {
  it('keeps life-era and work arcs', () => {
    expect(isDurableLifeArc({ title: 'Career Transition Arc', arc_type: 'work' })).toBe(true);
    expect(isDurableLifeArc({ title: 'Between jobs chapter', arc_type: 'life_era' })).toBe(true);
  });

  it('drops day occasions and shopping-trip titles', () => {
    expect(isDurableLifeArc({ title: 'A Costco Shopping Trip With Jamie', arc_type: 'occasion' })).toBe(
      false,
    );
    expect(isDurableLifeArc({ title: 'Grocery errand', arc_type: 'custom' })).toBe(false);
  });

  it('selects active durable arcs only', () => {
    const selected = selectProfileLifeArcs([
      { title: 'Career Transition Arc', arc_type: 'work', is_active: true, confidence: 0.9 },
      { title: 'A Shopping Trip With Jamie', arc_type: 'occasion', is_active: true, confidence: 0.9 },
      { title: 'Old job era', arc_type: 'life_era', is_active: false, confidence: 0.9 },
    ]);
    expect(selected.map((a) => a.title)).toEqual(['Career Transition Arc']);
  });
});
