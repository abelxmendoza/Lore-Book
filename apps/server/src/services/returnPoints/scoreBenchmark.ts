import { applyAction, selectReturnPoint } from './selectReturnPoint';
import { RETURN_POINT_SCENARIOS, type ReturnPointScenario } from './fixtures/scenarios';
import type { InteractionRecord } from './types';

export type ReturnPointBenchmarkReport = {
  scenarioCount: number;
  usefulReturnPointRate: number;
  falseUnfinishedRate: number;
  resolvedResurfacingRate: number;
  sensitiveUnsolicitedSurfaceRate: number;
  repetitionViolationRate: number;
  correctionCompliance: number;
  averageReturnPointsShown: number;
  gates: Record<string, boolean>;
  pass: boolean;
  failures: Array<{ id: string; issues: string[] }>;
};

function matchesAny(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

function bindInteractions(scenario: ReturnPointScenario): InteractionRecord[] {
  if (!scenario.interactions?.length) return [];
  // Interactions may reference matchText; ids assigned after first detect
  const first = selectReturnPoint({
    evidence: scenario.evidence,
    threadId: scenario.threadId,
    contextHint: scenario.contextHint,
    resumingSameThread: scenario.resumingSameThread,
    now: '2026-07-01T12:00:00.000Z',
  });
  const all = first.trace.candidates;
  const out: InteractionRecord[] = [];
  for (const ix of scenario.interactions) {
    const match = all.find(
      (c) =>
        (ix.matchText && c.summary.toLowerCase().includes(ix.matchText.toLowerCase())) ||
        (ix.returnPointId && c.id === ix.returnPointId),
    );
    if (!match) continue;
    out.push({
      returnPointId: match.id,
      surfaceCount: ix.surfaceCount ?? 0,
      dismissCount: ix.dismissCount ?? 0,
      continuedCount: ix.continuedCount ?? 0,
      resolvedCount: ix.resolvedCount ?? 0,
      forcedState: ix.forcedState as InteractionRecord['forcedState'],
    });
  }
  return out;
}

export function evaluateReturnScenario(scenario: ReturnPointScenario) {
  const issues: string[] = [];
  let interactions = bindInteractions(scenario);

  let result = selectReturnPoint({
    evidence: scenario.evidence,
    interactions,
    threadId: scenario.threadId,
    contextHint: scenario.contextHint,
    resumingSameThread: scenario.resumingSameThread,
    now: '2026-07-01T12:00:00.000Z',
  });

  const shown = result.selected ? 1 : 0;
  const surfaceBlob = result.selected
    ? `${result.selected.surfaceLine} ${result.selected.summary}`
    : '';

  if (scenario.expectSurface) {
    if (!result.selected) {
      issues.push('expected surface but got none');
    } else if (scenario.requiredSurface?.length) {
      if (!scenario.requiredSurface.some((r) => matchesAny(surfaceBlob, [r]))) {
        issues.push(`surface missing required: ${scenario.requiredSurface.join(', ')}`);
      }
    }
  } else if (result.selected) {
    // false unfinished if we didn't expect surface
    issues.push(`unexpected surface: ${result.selected.surfaceLine}`);
  }

  if (scenario.forbiddenSurface?.length && result.selected) {
    for (const f of scenario.forbiddenSurface) {
      if (matchesAny(surfaceBlob, [f])) {
        issues.push(`forbidden surface content: ${f}`);
      }
    }
  }

  // Sensitive unsolicited
  const sensitiveEvidence = scenario.evidence.some(
    (e) => e.sensitivity && e.sensitivity !== 'none',
  );
  if (sensitiveEvidence && !scenario.resumingSameThread && result.selected) {
    issues.push('sensitive unsolicited surface');
  }

  // Resolved should not resurface
  const hasResolution = scenario.evidence.some((e, i) => {
    if (i === 0) return false;
    return /\b(confirmed|finished|completed|heard back|no longer|changed my mind|handled|gave me)\b/i.test(
      e.text,
    );
  });
  if (hasResolution && result.selected && scenario.id.match(/resolved|abandoned|supersede|heard|confirmed/i)) {
    issues.push('resolved resurfacing');
  }

  // Actions
  if (scenario.afterActions?.length && result.selected) {
    let id = result.selected.id;
    for (const act of scenario.afterActions) {
      interactions = applyAction(interactions, id, act, '2026-07-02T12:00:00.000Z');
    }
    result = selectReturnPoint({
      evidence: scenario.evidence,
      interactions,
      threadId: scenario.threadId,
      contextHint: scenario.contextHint,
      now: '2026-07-03T12:00:00.000Z',
    });
    const afterShown = Boolean(result.selected);
    if (scenario.expectSurfaceAfterActions === false && afterShown) {
      issues.push('still surfaced after resolve/dismiss');
    }
    if (scenario.expectSurfaceAfterActions === true && !afterShown) {
      issues.push('expected surface after actions');
    }
  }

  return {
    id: scenario.id,
    issues,
    shown,
    selected: result.selected,
    falseUnfinished: !scenario.expectSurface && shown === 1,
    useful: scenario.expectSurface && shown === 1 && issues.length === 0,
    sensitiveLeak: sensitiveEvidence && !scenario.resumingSameThread && shown === 1,
    resolvedResurface: issues.includes('resolved resurfacing'),
  };
}

export function runReturnPointBenchmark(
  scenarios: ReturnPointScenario[] = RETURN_POINT_SCENARIOS,
): ReturnPointBenchmarkReport {
  const evaluated = scenarios.map(evaluateReturnScenario);
  const n = evaluated.length;

  const expectYes = scenarios.filter((s) => s.expectSurface);
  const usefulReturnPointRate =
    expectYes.length === 0
      ? 1
      : evaluated.filter((e) => {
          const sc = scenarios.find((s) => s.id === e.id)!;
          return sc.expectSurface && e.shown === 1 && e.issues.length === 0;
        }).length / expectYes.length;

  const expectNo = scenarios.filter((s) => !s.expectSurface);
  const falseUnfinishedRate =
    expectNo.length === 0
      ? 0
      : evaluated.filter((e) => {
          const sc = scenarios.find((s) => s.id === e.id)!;
          return !sc.expectSurface && e.shown === 1;
        }).length / expectNo.length;

  const resolvedCases = evaluated.filter((e) =>
    /resolved|abandoned|supersede|heard|confirmed|done/i.test(e.id),
  );
  const resolvedResurfacingRate =
    resolvedCases.length === 0
      ? 0
      : resolvedCases.filter((e) => e.shown === 1).length / resolvedCases.length;

  const sensitiveCases = scenarios.filter((s) =>
    s.evidence.some((e) => e.sensitivity && e.sensitivity !== 'none'),
  );
  const sensitiveUnsolicitedSurfaceRate =
    sensitiveCases.length === 0
      ? 0
      : sensitiveCases.filter((s) => {
          const e = evaluated.find((x) => x.id === s.id)!;
          return e.shown === 1 && !s.resumingSameThread;
        }).length / sensitiveCases.length;

  const repCases = scenarios.filter((s) => s.id.startsWith('RP') || s.interactions?.some((i) => (i.surfaceCount ?? 0) >= 3));
  const repetitionViolationRate =
    repCases.length === 0
      ? 0
      : repCases.filter((s) => {
          const e = evaluated.find((x) => x.id === s.id)!;
          return e.shown === 1;
        }).length / repCases.length;

  // Correction/lifecycle compliance: dismiss/resolve scenarios
  const life = scenarios.filter((s) => s.afterActions?.length);
  const correctionCompliance =
    life.length === 0
      ? 1
      : life.filter((s) => {
          const e = evaluated.find((x) => x.id === s.id)!;
          return e.issues.length === 0;
        }).length / life.length;

  const averageReturnPointsShown = evaluated.reduce((a, e) => a + e.shown, 0) / n;
  const failures = evaluated.filter((e) => e.issues.length > 0).map((e) => ({ id: e.id, issues: e.issues }));

  const gates = {
    resolved_resurfacing_0: resolvedResurfacingRate <= 0.001,
    sensitive_unsolicited_0: sensitiveUnsolicitedSurfaceRate <= 0.001,
    correction_compliance_100: correctionCompliance >= 0.999,
    avg_surfaced_le_1: averageReturnPointsShown <= 1,
    false_unfinished_le_0_05: falseUnfinishedRate <= 0.05,
    useful_rate_ge_0_7: usefulReturnPointRate >= 0.7,
  };

  const pass = Object.values(gates).every(Boolean) && failures.length === 0;

  return {
    scenarioCount: n,
    usefulReturnPointRate,
    falseUnfinishedRate,
    resolvedResurfacingRate,
    sensitiveUnsolicitedSurfaceRate,
    repetitionViolationRate,
    correctionCompliance,
    averageReturnPointsShown,
    gates,
    pass,
    failures,
  };
}

export function formatReturnPointReport(r: ReturnPointBenchmarkReport): string {
  return [
    '=== Return Point Benchmark ===',
    `scenarios: ${r.scenarioCount}`,
    `useful return-point rate: ${r.usefulReturnPointRate.toFixed(3)}`,
    `false unfinished rate: ${r.falseUnfinishedRate.toFixed(3)}`,
    `resolved resurfacing rate: ${r.resolvedResurfacingRate.toFixed(3)}`,
    `sensitive unsolicited surface rate: ${r.sensitiveUnsolicitedSurfaceRate.toFixed(3)}`,
    `repetition violation rate: ${r.repetitionViolationRate.toFixed(3)}`,
    `correction compliance: ${r.correctionCompliance.toFixed(3)}`,
    `average return points shown: ${r.averageReturnPointsShown.toFixed(3)}`,
    '',
    'Gates:',
    ...Object.entries(r.gates).map(([k, v]) => `  ${v ? 'PASS' : 'FAIL'} ${k}`),
    '',
    r.pass ? 'OVERALL: PASS' : `OVERALL: FAIL (${r.failures.length} scenarios)`,
    ...(r.failures.length
      ? ['Failures:', ...r.failures.slice(0, 25).map((f) => `  - ${f.id}: ${f.issues.join('; ')}`)]
      : []),
  ].join('\n');
}
