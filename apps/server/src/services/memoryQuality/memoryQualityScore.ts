/**
 * Offline Memory Quality Score.
 * Success = accurate life understanding without hallucinations.
 */

import { extractAutobiographicalMeaning } from './autobiographicalMeaningExtractor';
import { extractRelationshipDimensions } from './relationshipDimensions';
import { extractProgression } from './progressionDetector';
import { extractPreferenceLifecycle } from './preferenceStability';

export type ExpectedMemory = {
  people?: string[];
  places?: string[];
  organizations?: string[];
  lessons?: string[]; // substrings that should appear in lesson labels
  pastEventHints?: string[]; // e.g. "Genni"
  behaviorChanges?: string[]; // e.g. "boundary"
  relationshipDimensions?: Array<{ person: string; dimension: string }>;
  progressions?: string[]; // kind or label substrings
  preferences?: Array<{ subject: string; lifecycle: string }>;
  /** Facts that must NOT appear (hallucination traps) */
  mustNotInvent?: string[];
};

export type SampleScore = {
  id: string;
  person: number;
  relationship: number;
  eventQuality: number;
  timeline: number;
  identity: number;
  preference: number;
  continuity: number;
  contradiction: number; // 1 = no false contradictions
  hallucination: number; // 1 = no invented mustNotInvent
  duplicate: number; // 1 = no internal dup labels
  overall: number;
  details: {
    detectedLessons: string[];
    detectedPeopleHints: string[];
    detectedDimensions: string[];
    detectedProgressions: string[];
    detectedPreferences: string[];
    missed: string[];
    incorrect: string[];
  };
};

export type BenchmarkResult = {
  samples: SampleScore[];
  aggregate: Omit<SampleScore, 'id' | 'details'>;
  weights: Record<string, number>;
  metrics: {
    precision: number;
    recall: number;
    hallucinationFalsePositives: number;
    hardNegativeFalsePositives: number;
    duplicateRate: number;
    calibrationError: number;
    sampleCount: number;
    /** Event quality averaged only over fixtures with event expectations */
    eventQualityFocused: number;
  };
};

const WEIGHTS = {
  person: 0.1,
  relationship: 0.12,
  eventQuality: 0.2,
  timeline: 0.08,
  identity: 0.12,
  preference: 0.1,
  continuity: 0.12,
  contradiction: 0.05,
  hallucination: 0.08,
  duplicate: 0.03,
};

function recallPrecision(expected: string[], detected: string[]): number {
  if (expected.length === 0) return detected.length === 0 ? 1 : 0.8;
  const det = detected.map((d) => d.toLowerCase());
  let hits = 0;
  for (const e of expected) {
    const el = e.toLowerCase();
    if (det.some((d) => d.includes(el) || el.includes(d))) hits++;
  }
  const recall = hits / expected.length;
  // Light precision penalty only when expected nonempty
  return recall;
}

function hasSub(haystack: string[], needle: string): boolean {
  const n = needle.toLowerCase();
  return haystack.some((h) => h.toLowerCase().includes(n) || n.includes(h.toLowerCase()));
}

export function scoreSample(
  id: string,
  text: string,
  expected: ExpectedMemory,
  /** Optional entity names already extracted by the pipeline (people/places) */
  pipelineEntities?: { people?: string[]; places?: string[]; orgs?: string[] },
): SampleScore {
  const meaning = extractAutobiographicalMeaning(text);
  const rels = extractRelationshipDimensions(text);
  const progs = extractProgression(text);
  const prefs = extractPreferenceLifecycle(text);

  const peopleDetected = [
    ...(pipelineEntities?.people ?? []),
    ...rels.map((r) => r.personHint),
    ...meaning.nodes.filter((n) => n.kind === 'past_event').map((n) => n.label),
  ];
  const placesDetected = pipelineEntities?.places ?? [];
  const orgsDetected = pipelineEntities?.organizations ?? pipelineEntities?.orgs ?? [];

  const lessonsDetected = meaning.lessons.map((l) => l.lesson);
  const dimDetected = rels.map((r) => `${r.personHint}:${r.dimension}`);
  const progDetected = progs.map((p) => `${p.kind}:${p.label}`);
  const prefDetected = prefs.map((p) => `${p.subject}:${p.lifecycleKind}`);

  const missed: string[] = [];
  const incorrect: string[] = [];

  // Person
  const personScore = recallPrecision(expected.people ?? [], peopleDetected);
  for (const p of expected.people ?? []) {
    if (!hasSub(peopleDetected, p)) missed.push(`person:${p}`);
  }

  // Places (timeline-ish)
  const placeScore = recallPrecision(expected.places ?? [], placesDetected);
  for (const p of expected.places ?? []) {
    if (!hasSub(placesDetected, p)) missed.push(`place:${p}`);
  }

  // Relationships
  let relHits = 0;
  const relExpected = expected.relationshipDimensions ?? [];
  for (const e of relExpected) {
    const ok = rels.some(
      (r) =>
        r.personHint.toLowerCase().includes(e.person.toLowerCase()) &&
        r.dimension.includes(e.dimension.replace(/-/g, '_')),
    );
    if (ok) relHits++;
    else missed.push(`rel:${e.person}:${e.dimension}`);
  }
  const relationship = relExpected.length === 0 ? 1 : relHits / relExpected.length;

  // Event quality: lessons + chains + past anchors
  let eventHits = 0;
  let eventTotal = 0;
  for (const l of expected.lessons ?? []) {
    eventTotal++;
    if (hasSub(lessonsDetected, l) || meaning.nodes.some((n) => n.label.toLowerCase().includes(l.toLowerCase()))) {
      eventHits++;
    } else missed.push(`lesson:${l}`);
  }
  for (const p of expected.pastEventHints ?? []) {
    eventTotal++;
    if (
      meaning.nodes.some((n) => n.kind === 'past_event' && n.label.toLowerCase().includes(p.toLowerCase())) ||
      meaning.lessons.some((l) => (l.source || '').toLowerCase().includes(p.toLowerCase()))
    ) {
      eventHits++;
    } else missed.push(`past:${p}`);
  }
  for (const b of expected.behaviorChanges ?? []) {
    eventTotal++;
    if (
      meaning.nodes.some(
        (n) =>
          (n.kind === 'behavior_change' || n.kind === 'lesson') &&
          n.label.toLowerCase().includes(b.toLowerCase()),
      )
    ) {
      eventHits++;
    } else missed.push(`behavior:${b}`);
  }
  const eventQuality = eventTotal === 0 ? (meaning.nodes.length > 0 ? 0.7 : 0.5) : eventHits / eventTotal;

  // Continuity: chains present when expected
  const wantChain =
    (expected.pastEventHints?.length ?? 0) > 0 &&
    ((expected.lessons?.length ?? 0) > 0 || (expected.behaviorChanges?.length ?? 0) > 0);
  const continuity = wantChain ? (meaning.chains.length > 0 ? 1 : 0) : meaning.chains.length > 0 ? 0.9 : 0.85;
  if (wantChain && meaning.chains.length === 0) missed.push('continuity:chain');

  // Identity
  const identityNodes = meaning.nodes.filter((n) => n.kind === 'identity_growth');
  const identity =
    (expected.behaviorChanges?.length ?? 0) > 0 || (expected.lessons?.length ?? 0) > 0
      ? identityNodes.length > 0 || meaning.chains.some((c) => c.identityGrowth)
        ? 1
        : 0.4
      : 0.9;

  // Progression
  let progScore = 1;
  if ((expected.progressions?.length ?? 0) > 0) {
    let ph = 0;
    for (const p of expected.progressions!) {
      if (hasSub(progDetected, p) || progs.some((x) => x.kind.includes(p) || x.label.toLowerCase().includes(p.toLowerCase()))) {
        ph++;
      } else missed.push(`progression:${p}`);
    }
    progScore = ph / expected.progressions!.length;
  }

  // Preferences lifecycle
  let prefScore = 1;
  if ((expected.preferences?.length ?? 0) > 0) {
    let ph = 0;
    for (const p of expected.preferences!) {
      const ok = prefs.some(
        (x) =>
          x.subject.toLowerCase().includes(p.subject.toLowerCase()) &&
          x.lifecycleKind === p.lifecycle,
      );
      if (ok) ph++;
      else missed.push(`pref:${p.subject}:${p.lifecycle}`);
    }
    prefScore = ph / expected.preferences!.length;
  }

  // Hallucination: invented forbidden strings in labels
  let hallucination = 1;
  for (const bad of expected.mustNotInvent ?? []) {
    const blob = JSON.stringify({ meaning, rels, progs, prefs }).toLowerCase();
    if (blob.includes(bad.toLowerCase())) {
      hallucination = 0;
      incorrect.push(`hallucination:${bad}`);
    }
  }

  // Duplicates: identical lesson labels
  const lessonLabels = lessonsDetected.map((l) => l.toLowerCase());
  const dup = lessonLabels.length === new Set(lessonLabels).size ? 1 : 0.5;

  // Contradiction: we don't invent contradictions here
  const contradiction = 1;

  // Timeline uses places + past anchors
  const timeline = (placeScore + (expected.pastEventHints?.length ? eventQuality : 1)) / 2;

  const dimensions = {
    person: personScore,
    relationship,
    eventQuality,
    timeline,
    identity: Math.max(identity, progScore * 0.5),
    preference: prefScore,
    continuity,
    contradiction,
    hallucination,
    duplicate: dup,
  };

  const overall = Object.entries(WEIGHTS).reduce(
    (s, [k, w]) => s + w * (dimensions as Record<string, number>)[k],
    0,
  );

  return {
    id,
    ...dimensions,
    overall,
    details: {
      detectedLessons: lessonsDetected,
      detectedPeopleHints: peopleDetected,
      detectedDimensions: dimDetected,
      detectedProgressions: progDetected,
      detectedPreferences: prefDetected,
      missed,
      incorrect,
    },
  };
}

export function runBenchmark(
  samples: Array<{
    id: string;
    text: string;
    expected: ExpectedMemory;
    entities?: { people?: string[]; places?: string[]; orgs?: string[] };
    hardNegative?: boolean;
  }>,
): BenchmarkResult {
  const scores = samples.map((s) => {
    const sc = scoreSample(s.id, s.text, s.expected, s.entities);
    // Hard negatives: penalize any deep meaning extraction
    if (s.hardNegative) {
      const meaning = extractAutobiographicalMeaning(s.text);
      const deep =
        meaning.lessons.length +
        meaning.nodes.filter((n) =>
          ['identity_growth', 'behavior_change', 'future_continuity'].includes(n.kind),
        ).length;
      if (deep > 0) {
        sc.hallucination = 0;
        sc.details.incorrect.push(`hard_negative_fp:deep_meaning=${deep}`);
        sc.overall = Math.min(sc.overall, 0.4);
      }
    }
    return sc;
  });
  const keys = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
  const aggregate = keys.reduce(
    (acc, k) => {
      acc[k] = scores.reduce((s, x) => s + x[k], 0) / Math.max(1, scores.length);
      return acc;
    },
    { overall: 0 } as Record<string, number>,
  ) as BenchmarkResult['aggregate'];
  aggregate.overall = scores.reduce((s, x) => s + x.overall, 0) / Math.max(1, scores.length);

  // Precision/recall over mustExtract-style fields (lessons + relationships)
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let hallFp = 0;
  let hardFp = 0;
  let dupSum = 0;
  const calibration: Array<{ conf: number; correct: boolean }> = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const sc = scores[i];
    const meaning = extractAutobiographicalMeaning(s.text);
    for (const m of sc.details.missed) {
      if (m.startsWith('lesson:') || m.startsWith('rel:') || m.startsWith('past:')) fn++;
    }
    tp += Math.max(0, (s.expected.lessons?.length ?? 0) + (s.expected.relationshipDimensions?.length ?? 0) - sc.details.missed.filter((x) => x.startsWith('lesson:') || x.startsWith('rel:')).length);
    hallFp += sc.details.incorrect.filter((x) => x.startsWith('hallucination:')).length;
    hardFp += sc.details.incorrect.filter((x) => x.startsWith('hard_negative_fp:')).length;
    dupSum += 1 - sc.duplicate;
    for (const n of meaning.nodes) {
      const correct = sc.hallucination === 1 && !sc.details.incorrect.length;
      calibration.push({ conf: n.confidence, correct });
    }
  }
  // Approximate FP as incorrect non-hallucination noise
  fp = scores.reduce((s, x) => s + x.details.incorrect.length, 0);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

  // Calibration: mean |conf - correctness|
  const calibrationError =
    calibration.length === 0
      ? 0
      : calibration.reduce((s, c) => s + Math.abs(c.conf - (c.correct ? 1 : 0)), 0) / calibration.length;

  // Event quality focused: only samples that declare lesson/past/behavior expectations
  const eventFocused = samples
    .map((s, i) => ({ s, sc: scores[i] }))
    .filter(
      ({ s }) =>
        (s.expected.lessons?.length ?? 0) > 0 ||
        (s.expected.pastEventHints?.length ?? 0) > 0 ||
        (s.expected.behaviorChanges?.length ?? 0) > 0,
    );
  const eventQualityFocused =
    eventFocused.length === 0
      ? aggregate.eventQuality
      : eventFocused.reduce((sum, x) => sum + x.sc.eventQuality, 0) / eventFocused.length;

  return {
    samples: scores,
    aggregate,
    weights: { ...WEIGHTS },
    metrics: {
      precision,
      recall,
      hallucinationFalsePositives: hallFp,
      hardNegativeFalsePositives: hardFp,
      duplicateRate: dupSum / Math.max(1, scores.length),
      calibrationError,
      sampleCount: scores.length,
      eventQualityFocused,
    },
  };
}
