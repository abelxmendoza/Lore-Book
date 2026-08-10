import { beforeEach, describe, expect, it } from 'vitest';

import { CognitiveObservatory } from '../../src/services/cognitiveObservatory/cognitiveObservatory';

describe('Cognitive Observatory', () => {
  let observatory: CognitiveObservatory;

  beforeEach(() => { observatory = new CognitiveObservatory(); });

  it('shows timing, decisions, effects, and unconnected projection adapters', () => {
    observatory.recordStage({
      userId: 'synthetic-user', sourceId: 'message-1',
      trace: {
        stage: 'CANONICAL_STATE', status: 'PASS', startedAt: '2026-08-09T20:00:00.000Z',
        durationMs: 12, confidence: 0.97,
        counts: { inputs: 1, outputs: 2, reused: 2, updated: 2, discarded: 1 },
        decisions: ['PROJECT_STATUS_CHANGED', 'CURRENT_FOCUS_REPLACED'],
        downstreamEffects: ['project_projection', 'current_focus'],
      },
    });
    const trace = observatory.complete('synthetic-user', 'message-1')!;

    expect(trace.totals).toEqual(expect.objectContaining({ durationMs: 12, reused: 2, updated: 2, discarded: 1 }));
    expect(trace.projectionCoverage).toEqual(expect.objectContaining({
      project_projection: 'MEASURED', current_focus: 'MEASURED',
      identity_snapshot: 'NOT_WIRED', recall_composer: 'NOT_WIRED',
    }));
    expect(trace.invariants.containsRawMessageText).toBe(false);
  });

  it('does not return another tenant\'s trace', () => {
    observatory.recordStage({
      userId: 'synthetic-user', sourceId: 'message-1',
      trace: { stage: 'INGESTION', status: 'PASS', startedAt: 'now', durationMs: 1, counts: {}, decisions: [], downstreamEffects: [] },
    });
    expect(observatory.get('different-user', 'message-1')).toBeNull();
  });
});
