/**
 * Golden Story Questions — answer canonical life-story queries from NarrativeIR.
 */
import type { GoldenStoryAnswer, NarrativeIR } from './types';

export const GOLDEN_STORY_QUESTIONS = [
  'What chapter am I in?',
  'How has my life changed?',
  'What are the biggest turning points?',
  'What story am I living?',
  'Who has shaped me most?',
  'What conflicts define this chapter?',
  'What themes keep recurring?',
  'What should be in my autobiography?',
] as const;

export function answerGoldenQuestions(ir: NarrativeIR): GoldenStoryAnswer[] {
  const topTurning = ir.turningPoints.slice(0, 3).map((t) => t.title).join('; ') || 'None detected yet';
  const topPeople = ir.relationships.slice(0, 5).map((r) => r.name).join(', ') || 'Still gathering relationships';
  const conflicts = ir.conflicts.slice(0, 3).map((c) => c.label).join('; ') || 'No major conflicts surfaced';
  const themes = [...new Set([ir.currentChapter.dominantTheme, ...ir.activeArcs.map((a) => a.category)])].join(', ');
  const arcTitles = ir.activeArcs.map((a) => a.title).join(', ') || 'Emerging arcs';

  return [
    {
      question: GOLDEN_STORY_QUESTIONS[0],
      answer: `${ir.currentChapter.title}: ${ir.currentChapter.summary}`,
      confidence: ir.currentChapter.confidence,
      evidence: ir.currentChapter.evidence,
    },
    {
      question: GOLDEN_STORY_QUESTIONS[1],
      answer: `Momentum is ${ir.activeArcs.map((a) => `${a.title} (${a.momentum})`).join('; ') || 'still forming'}. Turning points: ${topTurning}.`,
      confidence: ir.provenance.confidence,
      evidence: ir.turningPoints.flatMap((t) => t.evidence).slice(0, 5),
    },
    {
      question: GOLDEN_STORY_QUESTIONS[2],
      answer: topTurning,
      confidence: ir.turningPoints[0]?.confidence ?? 0.4,
      evidence: ir.turningPoints.flatMap((t) => t.evidence).slice(0, 8),
    },
    {
      question: GOLDEN_STORY_QUESTIONS[3],
      answer: `You are living the "${ir.currentChapter.title}" chapter, shaped by ${arcTitles}.`,
      confidence: ir.currentChapter.confidence,
      evidence: ir.activeArcs.flatMap((a) => a.evidence).slice(0, 5),
    },
    {
      question: GOLDEN_STORY_QUESTIONS[4],
      answer: topPeople,
      confidence: ir.relationships[0]?.confidence ?? 0.5,
      evidence: ir.relationships.slice(0, 5).map((r, i) => ({
        id: `rel-${i}`,
        label: r.name,
        source: 'relationship',
        confidence: r.confidence,
      })),
    },
    {
      question: GOLDEN_STORY_QUESTIONS[5],
      answer: conflicts,
      confidence: ir.conflicts.length > 0 ? 0.75 : 0.3,
      evidence: [],
    },
    {
      question: GOLDEN_STORY_QUESTIONS[6],
      answer: themes,
      confidence: 0.7,
      evidence: ir.scenes.flatMap((s) => s.evidence.map((e, i) => ({
        id: `scene-${s.id}-${i}`,
        label: e,
        source: 'scene',
        confidence: s.confidence,
      }))).slice(0, 5),
    },
    {
      question: GOLDEN_STORY_QUESTIONS[7],
      answer: `Include: ${ir.currentChapter.title}; arcs: ${arcTitles}; scenes: ${ir.scenes.map((s) => s.title).join(', ')}.`,
      confidence: ir.provenance.confidence,
      evidence: ir.evidence.slice(0, 10),
    },
  ];
}
