import { describe, it, expect } from 'vitest';
import { detectPublicFigureProfile, isLikelyStageName } from '../../src/services/publicFigure/publicFigureDetection';
import { inferFromEpisodes } from '../../src/services/publicFigure/publicFigureInferenceUtils';

describe('publicFigureDetection', () => {
  it('flags Hell Fairy as performer from stage name + scene context', () => {
    const p = detectPublicFigureProfile({
      name: 'Hell Fairy',
      summary: 'Performer at the goth club underground scene',
      metadata: {},
    });
    expect(p.isPublicFigure).toBe(true);
    expect(p.figureType).toBe('performer');
  });

  it('does not flag Tía Grace as public figure', () => {
    const p = detectPublicFigureProfile({ name: 'Tía Grace', metadata: { relationship_type: 'family' } });
    expect(p.isPublicFigure).toBe(false);
  });

  it('detects likely stage names', () => {
    expect(isLikelyStageName('Hell Fairy')).toBe(true);
    expect(isLikelyStageName('Mom')).toBe(false);
  });
});

describe('publicFigure inference from text', () => {
  it('infers brief contact when user talked to figure', () => {
    const hits = inferFromEpisodes('Hell Fairy', [{
      source: 'chat',
      id: '1',
      text: 'After the goth show at Neon Lounge I talked to Hell Fairy backstage for a few minutes.',
    }]);
    expect(hits.some((h) => h.type === 'explicit_dialogue')).toBe(true);
  });

  it('infers scene presence from co-located show context', () => {
    const hits = inferFromEpisodes('Hell Fairy', [{
      source: 'journal',
      id: '2',
      text: 'I watched Hell Fairy perform their set at the anniversary show. The crowd was wild.',
    }]);
    expect(hits.some((h) => h.type === 'scene_context')).toBe(true);
  });
});
