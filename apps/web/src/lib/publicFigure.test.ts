import { describe, it, expect } from 'vitest';
import { impactOnUserWithPublicFigureCap, isPublicFigureCharacter } from './publicFigure';
import type { Character } from '../components/characters/CharacterProfileCard';

const baseChar = (overrides: Partial<Character> = {}): Character => ({
  id: 'c1',
  name: 'Hell Fairy',
  relatedPeople: [],
  tagCounts: [],
  chapters: [],
  moods: [],
  entries: [],
  sources: [],
  analytics: { character_influence_on_user: 85 } as Character['analytics'],
  metadata: { public_figure: true },
  ...overrides,
});

describe('publicFigure lib', () => {
  it('detects public figures from metadata', () => {
    expect(isPublicFigureCharacter(baseChar())).toBe(true);
    expect(isPublicFigureCharacter(baseChar({ metadata: {} }))).toBe(false);
  });

  it('caps impact for distant public figures', () => {
    const score = impactOnUserWithPublicFigureCap(baseChar({
      metadata: {
        public_figure: true,
        public_figure_connection: { stage: 'distant_fan' },
      },
    }));
    expect(score).toBeLessThanOrEqual(25);
  });

  it('allows higher impact for growing connections', () => {
    const score = impactOnUserWithPublicFigureCap(baseChar({
      metadata: {
        public_figure: true,
        public_figure_connection: { stage: 'growing' },
      },
    }));
    expect(score).toBeLessThanOrEqual(65);
    expect(score).toBeGreaterThan(25);
  });

  it('respects user impact override', () => {
    const score = impactOnUserWithPublicFigureCap(baseChar({
      metadata: { public_figure: true, impact_override: 95 },
    }));
    expect(score).toBe(95);
  });
});
