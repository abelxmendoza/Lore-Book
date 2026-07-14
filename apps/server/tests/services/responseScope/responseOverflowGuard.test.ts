import { describe, it, expect } from 'vitest';

import { detectOverflow, enforceChatScope, pruneToAnswer } from '../../../src/services/responseScope/responseOverflowGuard';
import { planResponseScope } from '../../../src/services/responseScope/responseScopePlanner';

// Fictional cast only.
const WORK_PLAN = planResponseScope("Who's on my team at Titanworks?");

const DUMP = [
  'Let me check what I actually have:',
  '',
  '**This thread**',
  'message one, message two, message three',
  '',
  '**Character memory**',
  ...Array.from({ length: 30 }, (_, i) => `• Fictional Person ${i} — background details`),
  '',
  '**Structured memory layers**',
  '• biography: ✓ — subject snapshot text',
  '• characters: ✓ — 56 rows',
  '• relationships: ✓ — 24 rows retrievable',
  '• timeline: ✓ — 214 events',
].join('\n');

describe('overflow detection', () => {
  it('flags diagnostic sections and entity floods', () => {
    const verdict = detectOverflow(DUMP);
    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual(expect.arrayContaining(['diagnostic_sections', 'entity_flood']));
  });

  it('passes a short focused answer untouched', () => {
    const answer = 'Your Titanworks team includes Kavi, Wren, and Kelan. Kavi is usually the on-site lead.';
    expect(detectOverflow(answer).ok).toBe(true);
    expect(enforceChatScope(answer, WORK_PLAN).content).toBe(answer);
  });
});

describe('pruning', () => {
  it('never renders memory-layer status in chat output', () => {
    const { content, violations } = enforceChatScope(DUMP, WORK_PLAN);
    expect(violations.length).toBeGreaterThan(0);
    expect(content).not.toMatch(/structured memory layers/i);
    expect(content).not.toMatch(/retrievable/);
  });

  it('keeps sections relevant to the question entities', () => {
    const mixed = [
      '**Work**',
      'Titanworks team: Kavi, Wren, Kelan.',
      '**Family**',
      ...Array.from({ length: 20 }, (_, i) => `• relative ${i}`),
      '**Structured memory layers**',
      '• layer: characters retrievable ✓',
      '• layer: relationships retrievable ✓',
      '• layer: timeline retrievable ✓',
    ].join('\n');
    const pruned = pruneToAnswer(mixed, WORK_PLAN);
    expect(pruned).toContain('Titanworks');
    expect(pruned).not.toMatch(/structured memory layers/i);
  });

  it('audit mode is exempt — explicit audits may be long', () => {
    const auditPlan = planResponseScope('show me everything you know about my characters');
    expect(enforceChatScope(DUMP, auditPlan).content).toBe(DUMP);
  });
});
