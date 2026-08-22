import { describe, expect, it } from 'vitest';
import { applySummaryDiscipline, summarizeDisciplineRewrites } from './summaryDiscipline';

describe('summaryDiscipline', () => {
  it('keeps user interpretation from becoming another person\'s internal state', () => {
    const source = 'I think Maya was jealous when she saw me talking with Priya. Maya said I made her uncomfortable.';
    const summary =
      'Maya overheard a conversation, which contributed to her discomfort and feelings of jealousy.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text.toLowerCase()).not.toMatch(/her discomfort and feelings of jealousy/);
    expect(result.text).toMatch(/user believed/i);
    expect(result.warnings.some((w) => w.warning === 'interpretation_as_fact')).toBe(true);
  });

  it('keeps a reported statement from becoming an objective assertion', () => {
    const source = 'Maya said I made her uncomfortable.';
    const summary = 'Maya said the user made her uncomfortable.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text).toMatch(/said/i);
    expect(result.text.toLowerCase()).not.toMatch(/objectively made/);
  });

  it('keeps fear from becoming a confirmed event', () => {
    const source = 'I fear people at the new club heard about me.';
    const summary = 'The user\'s reputation spread to the new club.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text).toMatch(/worried/i);
    expect(result.warnings.some((w) => w.warning === 'fear_as_fact')).toBe(true);
  });

  it('keeps a third-party allegation from becoming a fact about the named person', () => {
    const source = 'People called Rowan a liar.';
    const summary = 'Rowan is a liar.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text).toMatch(/people called Rowan a liar/i);
    expect(result.warnings.some((w) => w.warning === 'allegation_as_fact')).toBe(true);
  });

  it('does not invent causality from sequence', () => {
    const source = 'She overheard us. Later she confronted me.';
    const summary = 'She overheard us, which contributed to the confrontation.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text.toLowerCase()).not.toMatch(/contributed to/);
    expect(result.warnings.some((w) => w.warning === 'unsupported_causality')).toBe(true);
  });

  it('does not upgrade member to prominent member', () => {
    const source = 'Maya is part of the scene.';
    const summary = 'Maya, a prominent member of the ska scene and a friend, was there.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text.toLowerCase()).not.toMatch(/prominent/);
    expect(result.warnings.some((w) => w.warning === 'unsupported_embellishment')).toBe(true);
  });

  it('drops decorative low-salience details from a relationship recap', () => {
    const source =
      'I knew Maya through the ska scene. She pushed my arm away and said get off her. I stopped attending ska shows.';
    const summary =
      'Maya dyed her hair purple. The user knew Maya through the ska scene and later stopped attending ska shows.';
    const result = applySummaryDiscipline(summary, source);
    expect(result.text.toLowerCase()).not.toMatch(/purple/);
    expect(result.text).toMatch(/ska scene/i);
  });

  it('marks every rewritten sentence and does not leak another user\'s source text', () => {
    const userA = 'I think Maya was jealous.';
    const userB = 'Jamie is my coworker at Vanguard Robotics.';
    const a = applySummaryDiscipline('Maya was jealous.', userA);
    const b = applySummaryDiscipline('Jamie works at Vanguard Robotics.', userB);
    expect(a.text.toLowerCase()).not.toMatch(/vanguard/);
    expect(b.text.toLowerCase()).not.toMatch(/jealous/);
  });

  it('counts causal, embellishment, and epistemic rewrites separately', () => {
    const source = 'I think Maya was jealous. People called Rowan a liar.';
    const summary =
      'Maya was jealous, which contributed to the split. Rowan is a liar. Maya is a prominent member of the ska scene.';
    const result = applySummaryDiscipline(summary, source);
    const counts = summarizeDisciplineRewrites(result.warnings);
    expect(counts.causalRewriteCount).toBeGreaterThan(0);
    expect(counts.embellishmentRewriteCount).toBeGreaterThan(0);
    expect(counts.epistemicRewriteCount).toBeGreaterThan(0);
  });
});
