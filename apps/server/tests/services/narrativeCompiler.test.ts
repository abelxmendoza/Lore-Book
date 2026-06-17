import { describe, expect, it } from 'vitest';

import { compileChapter } from '../../src/services/narrative/chapterCompilerService';
import { answerGoldenQuestions } from '../../src/services/narrative/storyGoldenQuestions';
import type { LifeArcSynthesis } from '../../src/services/continuityRuntime/arcs/lifeArcSynthesisService';
import type { NarrativeIR } from '../../src/services/narrative/types';

const minimalSynthesis = (): LifeArcSynthesis => ({
  currentChapter: { label: 'Rebuild', narrative: 'Career and creative momentum.', evidence: ['Amazon onboarding'] },
  candidateArcs: [],
  enrichedArcs: [{
    id: 'arc-1',
    title: 'Career Rebuild',
    category: 'career',
    momentum: 'growing',
    score: 0.8,
    evidence: ['Amazon onboarding'],
    sources: ['journal'],
    provenance: {
      evidenceCount: 2,
      episodes: [{ id: 'e1', label: 'Started at Amazon', date: '2026-01-15' }],
      goals: [],
      projects: [],
      relationships: [],
      events: [],
      confidence: 0.85,
    },
    startDate: '2026-01-01',
    latestActivity: '2026-03-01',
  }],
  conflicts: [],
  lifeDirection: { movingToward: [], gainingMomentum: [], fading: [], deservesAttention: [] },
  signalInventory: { career: 3, family: 0, relationship: 0, health: 0, creative: 1, learning: 0, community: 0, custom: 0 },
  generatedAt: new Date().toISOString(),
  text: '',
});

describe('chapterCompilerService', () => {
  it('compiles chapter with theme and evidence', () => {
    const chapter = compileChapter(minimalSynthesis());
    expect(chapter.title).toBe('Rebuild');
    expect(chapter.dominantTheme).toBe('career');
    expect(chapter.evidenceCount).toBeGreaterThan(0);
    expect(chapter.confidence).toBeGreaterThan(0);
  });
});

describe('storyGoldenQuestions', () => {
  it('answers golden questions from IR', () => {
    const synthesis = minimalSynthesis();
    const chapter = compileChapter(synthesis);
    const ir: NarrativeIR = {
      generatedAt: new Date().toISOString(),
      currentChapter: chapter,
      activeArcs: [],
      dormantArcs: [],
      conflicts: [],
      goals: [],
      projects: [],
      relationships: [{ id: 'c1', name: 'Mom', role: 'parent', confidence: 0.9 }],
      communities: [],
      turningPoints: [],
      scenes: [],
      timeline: [],
      family: { householdCount: 1, memberCount: 5, groupCount: 0 },
      evidence: chapter.evidence,
      provenance: { confidence: 0.8, signalInventory: {}, why: 'test' },
    };
    const answers = answerGoldenQuestions(ir);
    expect(answers).toHaveLength(8);
    expect(answers[0].question).toContain('chapter');
    expect(answers[0].answer).toContain('Rebuild');
  });
});
