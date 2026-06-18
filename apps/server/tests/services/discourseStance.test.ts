/**
 * Discourse & narrative stage detector tests.
 */
import { describe, expect, it } from 'vitest';

import {
  detectDiscourseMoves,
  detectNarrativeStages,
  hasStoryFrameCue,
  hasTangentCue,
} from '../../src/services/ontology/discourseStance';

describe('discourseStance', () => {
  it('detects tangent cues', () => {
    const moves = detectDiscourseMoves('Anyway, totally unrelated — I need to fix my bike.');
    expect(moves.some((m) => m.move === 'TANGENT')).toBe(true);
    expect(hasTangentCue('Anyway, random thought about pizza.')).toBe(true);
  });

  it('detects subject change', () => {
    const moves = detectDiscourseMoves('That reminds me, how is your mom doing?');
    expect(moves.some((m) => m.move === 'SUBJECT_CHANGE')).toBe(true);
  });

  it('detects story open and close', () => {
    expect(hasStoryFrameCue('Long story short, I quit my job.')).toBe(true);
    const moves = detectDiscourseMoves("And that's the story.");
    expect(moves.some((m) => m.move === 'STORY_CLOSE')).toBe(true);
  });

  it('detects narrative stages', () => {
    const stages = detectNarrativeStages(
      'It started when I moved to Austin. Then one day everything changed when I got laid off. Looking back, I learned a lot.',
    );
    expect(stages.some((s) => s.stage === 'SETUP')).toBe(true);
    expect(stages.some((s) => s.stage === 'INCITING')).toBe(true);
    expect(stages.some((s) => s.stage === 'REFLECTION')).toBe(true);
  });

  it('hasTangentCue is false for on-topic statements', () => {
    expect(hasTangentCue('I went to the gym today.')).toBe(false);
  });
});
