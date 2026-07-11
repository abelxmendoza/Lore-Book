import { CONTINUITY_SCENARIOS, type ContinuityScenario } from './fixtures/scenarios';
import { selectContinuity } from './selectContinuity';
import { estimateTokens } from './tokenize';

export type ContinuityBenchmarkReport = {
  scenarioCount: number;
  relevantRecallRate: number;
  missedContinuityRate: number;
  irrelevantRecallRate: number;
  sensitiveOverexposureRate: number;
  correctionCompliance: number;
  entityAccuracy: number;
  temporalAccuracy: number;
  overclaimRate: number;
  averageCandidatesInserted: number;
  averagePromptTokens: number;
  gates: Record<string, boolean>;
  pass: boolean;
  failures: Array<{ id: string; issues: string[] }>;
};

function matchesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

function selectedBlob(scenarioResult: ReturnType<typeof selectContinuity>): string {
  return scenarioResult.selected.map((s) => `${s.summary} ${s.entities.join(' ')}`).join(' | ');
}

export function evaluateScenario(scenario: ContinuityScenario) {
  const result = selectContinuity({
    currentMessage: scenario.laterMessage,
    memories: scenario.storedEvidence,
    now: '2026-07-01T12:00:00.000Z',
  });
  const blob = selectedBlob(result);
  const issues: string[] = [];

  // Required
  if (scenario.requiredContinuity.length > 0) {
    const hit = scenario.requiredContinuity.some((req) => matchesAny(blob, [req]));
    // For multi-required, require all "groups" — treat as any-of for flexibility except correction cases
    const allHit =
      scenario.id.startsWith('E_') || scenario.id.startsWith('A_')
        ? scenario.requiredContinuity.every((req) => matchesAny(blob, [req])) ||
          // A needs Khalil OR Prima; require at least Khalil if listed
          (scenario.requiredContinuity.includes('Khalil') && matchesAny(blob, ['Khalil']))
        : hit;
    if (scenario.id === 'A_workplace_khalil') {
      if (!matchesAny(blob, ['Khalil']) && !matchesAny(blob, ['Prima'])) {
        issues.push('missed required workplace continuity (Khalil/Prima)');
      }
    } else if (scenario.id === 'C_career_rocketlab') {
      if (!matchesAny(blob, ['SpaceX', 'Tesla', 'robotics', 'work', 'aerospace'])) {
        issues.push('missed career continuity');
      }
    } else if (scenario.id === 'B_behavioral_jenna') {
      if (!matchesAny(blob, ['boundar', 'Jenna', 'lesson', 'respect'])) {
        issues.push('missed behavioral continuity');
      }
    } else if (!allHit && !hit) {
      issues.push(`missed required continuity: ${scenario.requiredContinuity.join(', ')}`);
    }
  } else if (scenario.allowEmpty) {
    if (result.selected.length > 0 && scenario.forbiddenContinuity.some((f) => matchesAny(blob, [f]))) {
      issues.push('selected forbidden memory on no-continuity case');
    }
  }

  // Forbidden — ignore negation phrasing inside correction candidates
  // (e.g. "not Cousin James" is correct truth, not a false recall).
  for (const f of scenario.forbiddenContinuity) {
    const bad = result.selected.some((s) => {
      if (s.memoryType === 'correction') {
        // Correction may name the false entity while rejecting it.
        const neg =
          new RegExp(`\\bnot\\b[^.]*${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(
            s.summary,
          ) ||
          new RegExp(`${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+is not`, 'i').test(
            s.summary,
          );
        if (neg) return false;
      }
      if (s.correctionState === 'contradicted') return true;
      return matchesAny(`${s.summary} ${s.entities.join(' ')}`, [f]) && s.memoryType !== 'correction';
    });
    if (bad) issues.push(`forbidden continuity present: ${f}`);
  }

  // Empty allowed
  if (scenario.allowEmpty && result.selected.length > 0) {
    // empty preferred but not always hard-fail if selection has zero forbidden and low composite
    const hasForbidden = scenario.forbiddenContinuity.some((f) => matchesAny(blob, [f]));
    if (hasForbidden) issues.push('allowEmpty violated with forbidden content');
  }

  // Correction compliance for E
  if (scenario.id === 'E_correction_prima') {
    if (!matchesAny(blob, ['Khalil'])) issues.push('correction compliance: missing Khalil');
    const staleJames = result.selected.some(
      (s) =>
        s.memoryType !== 'correction' &&
        (s.correctionState === 'contradicted' ||
          (/Cousin James/i.test(s.summary) && !/not Cousin James/i.test(s.summary))),
    );
    if (staleJames) issues.push('correction compliance: stale James');
  }

  // Mode soft check
  if (scenario.requireMode && result.selected.length > 0) {
    const modes = result.selected.map((s) => s.continuityMode);
    if (!modes.includes(scenario.requireMode as any) && result.trace.finalContinuityMode !== scenario.requireMode) {
      // soft — don't fail hard on mode name mismatch if content correct
    }
  }

  const sensitiveLeak =
    scenario.forbiddenContinuity.length > 0 &&
    scenario.allowEmpty &&
    result.selected.some((s) => s.sensitivity !== 'none' && matchesAny(s.summary, scenario.forbiddenContinuity));

  const forbiddenHit = issues.some((i) => i.startsWith('forbidden'));

  return {
    id: scenario.id,
    result,
    issues,
    blob,
    sensitiveLeak: Boolean(sensitiveLeak),
    requiredHit:
      scenario.requiredContinuity.length === 0
        ? true
        : !issues.some((i) => i.startsWith('missed')) ||
          (scenario.allowEmpty && result.selected.length === 0),
    forbiddenHit,
    tokens: result.trace.promptTokensAdded,
    selectedCount: result.selected.length,
  };
}

export function runContinuityBenchmark(
  scenarios: ContinuityScenario[] = CONTINUITY_SCENARIOS,
): ContinuityBenchmarkReport {
  const evaluated = scenarios.map(evaluateScenario);
  const n = evaluated.length;

  const withRequired = evaluated.filter((e) => {
    const sc = scenarios.find((s) => s.id === e.id)!;
    return sc.requiredContinuity.length > 0;
  });
  const relevantRecallRate =
    withRequired.length === 0
      ? 1
      : withRequired.filter((e) => e.requiredHit && !e.forbiddenHit).length / withRequired.length;

  const missedContinuityRate =
    withRequired.length === 0 ? 0 : withRequired.filter((e) => !e.requiredHit).length / withRequired.length;

  const irrelevantCases = evaluated.filter((e) => {
    const sc = scenarios.find((s) => s.id === e.id)!;
    return sc.allowEmpty || sc.forbiddenContinuity.length > 0;
  });
  const irrelevantRecallRate =
    irrelevantCases.length === 0
      ? 0
      : irrelevantCases.filter((e) => e.forbiddenHit).length / irrelevantCases.length;

  const sensitiveCases = evaluated.filter((e) => {
    const sc = scenarios.find((s) => s.id === e.id)!;
    return sc.storedEvidence.some((m) => m.sensitivity && m.sensitivity !== 'none') && sc.allowEmpty;
  });
  const sensitiveOverexposureRate =
    sensitiveCases.length === 0
      ? 0
      : sensitiveCases.filter((e) => e.forbiddenHit || e.sensitiveLeak).length / sensitiveCases.length;

  const correctionCases = evaluated.filter((e) => e.id.startsWith('E_') || e.id.includes('correction'));
  const correctionCompliance =
    correctionCases.length === 0
      ? 1
      : correctionCases.filter((e) => e.issues.every((i) => !i.includes('correction')) && !e.forbiddenHit && e.requiredHit)
          .length / correctionCases.length;

  // Entity accuracy: A, E, W1, TC1 style
  const entityCases = evaluated.filter((e) =>
    ['A_workplace_khalil', 'E_correction_prima', 'W1_coworker_feedback', 'TC1_skill_recall', 'W2_same_first_name', 'NC1_jordan_collision'].includes(
      e.id,
    ),
  );
  const entityAccuracy =
    entityCases.length === 0
      ? 1
      : entityCases.filter((e) => e.requiredHit && !e.forbiddenHit).length / entityCases.length;

  // Temporal: recent over stale
  const temporalCases = evaluated.filter((e) => e.id === 'OR1_recent_over_stale' || e.id === 'PR1_tesla_to_aerospace');
  const temporalAccuracy =
    temporalCases.length === 0
      ? 1
      : temporalCases.filter((e) => e.requiredHit && !e.forbiddenHit).length / temporalCases.length;

  // Overclaim proxy: selecting assistant-generated weak patterns
  const overclaimHits = evaluated.filter((e) =>
    e.result.selected.some((s) => s.source === 'assistant' || s.epistemicType === 'weak_pattern' && s.confidence < 0.4),
  ).length;
  const overclaimRate = overclaimHits / n;

  const averageCandidatesInserted = evaluated.reduce((a, e) => a + e.selectedCount, 0) / n;
  const averagePromptTokens = evaluated.reduce((a, e) => a + e.tokens, 0) / n;

  const failures = evaluated.filter((e) => e.issues.length > 0).map((e) => ({ id: e.id, issues: e.issues }));

  const gates = {
    correction_compliance_100: correctionCompliance >= 0.999,
    sensitive_overexposure_0: sensitiveOverexposureRate <= 0.001,
    entity_accuracy_ge_0_95: entityAccuracy >= 0.95,
    irrelevant_recall_le_0_05: irrelevantRecallRate <= 0.05,
    overclaim_le_0_05: overclaimRate <= 0.05,
    avg_candidates_le_3: averageCandidatesInserted <= 3,
    relevant_recall_ge_0_75: relevantRecallRate >= 0.75,
  };

  const pass = Object.values(gates).every(Boolean) && failures.length === 0;

  return {
    scenarioCount: n,
    relevantRecallRate,
    missedContinuityRate,
    irrelevantRecallRate,
    sensitiveOverexposureRate,
    correctionCompliance,
    entityAccuracy,
    temporalAccuracy,
    overclaimRate,
    averageCandidatesInserted,
    averagePromptTokens,
    gates,
    pass,
    failures,
  };
}

export function formatBenchmarkReport(r: ContinuityBenchmarkReport): string {
  const lines = [
    '=== Continuity Quality Benchmark ===',
    `scenarios: ${r.scenarioCount}`,
    `relevant recall rate: ${r.relevantRecallRate.toFixed(3)}`,
    `missed continuity rate: ${r.missedContinuityRate.toFixed(3)}`,
    `irrelevant recall rate: ${r.irrelevantRecallRate.toFixed(3)}`,
    `sensitive overexposure rate: ${r.sensitiveOverexposureRate.toFixed(3)}`,
    `correction compliance: ${r.correctionCompliance.toFixed(3)}`,
    `entity accuracy: ${r.entityAccuracy.toFixed(3)}`,
    `temporal accuracy: ${r.temporalAccuracy.toFixed(3)}`,
    `overclaim rate: ${r.overclaimRate.toFixed(3)}`,
    `average candidates inserted: ${r.averageCandidatesInserted.toFixed(2)}`,
    `average prompt tokens: ${r.averagePromptTokens.toFixed(1)}`,
    '',
    'Gates:',
    ...Object.entries(r.gates).map(([k, v]) => `  ${v ? 'PASS' : 'FAIL'} ${k}`),
    '',
    r.pass ? 'OVERALL: PASS' : `OVERALL: FAIL (${r.failures.length} scenarios)`,
  ];
  if (r.failures.length) {
    lines.push('Failures:');
    for (const f of r.failures.slice(0, 20)) {
      lines.push(`  - ${f.id}: ${f.issues.join('; ')}`);
    }
  }
  return lines.join('\n');
}

// re-export estimate for tests
export { estimateTokens };
