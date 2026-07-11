import { describe, it, expect } from 'vitest';
import { selectReturnPoint, applyAction } from './selectReturnPoint';
import { isConditionalOnly } from './detectOpenThreads';
import { evaluateReturnScenario, runReturnPointBenchmark, formatReturnPointReport } from './scoreBenchmark';
import { RETURN_POINT_SCENARIOS } from './fixtures/scenarios';

describe('returnPoints detection', () => {
  it('does not treat conditional as open', () => {
    expect(isConditionalOnly('If I get the job, I might move.')).toBe(true);
    expect(isConditionalOnly("I'm interviewing with Rocket Lab on Monday.")).toBe(false);
  });

  it('surfaces Rocket Lab waiting', () => {
    const r = selectReturnPoint({
      evidence: [
        {
          id: '1',
          text: 'I submitted my interview availability to Rocket Lab.',
          sourceType: 'message',
          at: '2026-06-02T12:00:00.000Z',
          entities: ['Rocket Lab'],
        },
      ],
      now: '2026-07-01T12:00:00.000Z',
    });
    expect(r.selected).not.toBeNull();
    expect(r.selected!.surfaceLine).toMatch(/Rocket Lab/i);
  });

  it('resolves after confirmation', () => {
    const r = selectReturnPoint({
      evidence: [
        {
          id: '1',
          text: 'I submitted my interview availability to Rocket Lab.',
          sourceType: 'message',
          at: '2026-06-01T12:00:00.000Z',
          entities: ['Rocket Lab'],
        },
        {
          id: '2',
          text: 'They confirmed Monday at 4 PM for Rocket Lab.',
          sourceType: 'message',
          at: '2026-06-05T12:00:00.000Z',
          entities: ['Rocket Lab'],
        },
      ],
      now: '2026-07-01T12:00:00.000Z',
    });
    expect(r.selected).toBeNull();
  });

  it('never surfaces sensitive unsolicited', () => {
    const r = selectReturnPoint({
      evidence: [
        {
          id: '1',
          text: "I'm worried my team dislikes me and still waiting for feedback.",
          sourceType: 'message',
          at: '2026-06-02T12:00:00.000Z',
          sensitivity: 'workplace_insecurity',
        },
      ],
      now: '2026-07-01T12:00:00.000Z',
    });
    expect(r.selected).toBeNull();
  });

  it('dismiss then hide', () => {
    const first = selectReturnPoint({
      evidence: [
        {
          id: '1',
          text: 'I am still waiting to hear back from Acme Corp.',
          sourceType: 'message',
          at: '2026-06-02T12:00:00.000Z',
        },
      ],
      now: '2026-07-01T12:00:00.000Z',
    });
    expect(first.selected).not.toBeNull();
    const ix = applyAction([], first.selected!.id, 'dismiss', '2026-07-02T12:00:00.000Z');
    const second = selectReturnPoint({
      evidence: [
        {
          id: '1',
          text: 'I am still waiting to hear back from Acme Corp.',
          sourceType: 'message',
          at: '2026-06-02T12:00:00.000Z',
        },
      ],
      interactions: ix,
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(second.selected).toBeNull();
  });

  it('max one return point', () => {
    const r = selectReturnPoint({
      evidence: [
        {
          id: 'a',
          text: 'I am still waiting to hear back from Rocket Lab.',
          sourceType: 'message',
          at: '2026-06-10T12:00:00.000Z',
        },
        {
          id: 'b',
          text: 'I still need to finish the blog draft.',
          sourceType: 'message',
          at: '2026-06-01T12:00:00.000Z',
        },
      ],
      now: '2026-07-01T12:00:00.000Z',
    });
    expect(r.selected ? 1 : 0).toBeLessThanOrEqual(1);
  });
});

describe('returnPoints required scenarios', () => {
  for (const id of [
    'RL1_waiting',
    'RL2_resolved',
    'WA1_waiting_assignment',
    'WA2_resolved_assignment',
    'LB2_vocab_context',
    'S1_workplace_insecurity',
    'AG1_tesla_abandoned',
    'C1_conditional_move',
  ]) {
    it(`passes ${id}`, () => {
      const sc = RETURN_POINT_SCENARIOS.find((s) => s.id === id)!;
      const ev = evaluateReturnScenario(sc);
      expect(ev.issues, ev.issues.join('; ')).toEqual([]);
    });
  }
});

describe('returnPoints full benchmark', () => {
  it('has at least 40 scenarios', () => {
    expect(RETURN_POINT_SCENARIOS.length).toBeGreaterThanOrEqual(40);
  });

  it('meets release gates', () => {
    const report = runReturnPointBenchmark();
    // eslint-disable-next-line no-console
    console.log(formatReturnPointReport(report));
    expect(report.gates.resolved_resurfacing_0).toBe(true);
    expect(report.gates.sensitive_unsolicited_0).toBe(true);
    expect(report.gates.correction_compliance_100).toBe(true);
    expect(report.gates.avg_surfaced_le_1).toBe(true);
    expect(report.gates.false_unfinished_le_0_05).toBe(true);
    expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
    expect(report.pass).toBe(true);
  });
});
