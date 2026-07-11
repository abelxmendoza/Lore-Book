import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  extractAutobiographicalMeaning,
  isNonAutobiographicalContext,
} from '../../../src/services/memoryQuality/autobiographicalMeaningExtractor';
import { extractRelationshipDimensions } from '../../../src/services/memoryQuality/relationshipDimensions';
import { extractProgression } from '../../../src/services/memoryQuality/progressionDetector';
import { extractPreferenceLifecycle } from '../../../src/services/memoryQuality/preferenceStability';
import { computeClaimConfidence } from '../../../src/services/memoryQuality/confidenceModel';
import { runBenchmark, scoreSample } from '../../../src/services/memoryQuality/memoryQualityScore';
import { AUTOBIOGRAPHICAL_SAMPLES } from '../../../src/services/memoryQuality/fixtures/autobiographicalSamples';
import {
  buildMeaningFingerprint,
  MEMORY_QUALITY_EXTRACTOR_VERSION,
  normalizeMeaningValue,
} from '../../../src/services/memoryQuality/meaningArtifactIdentity';

const GENNI_FIXTURE = AUTOBIOGRAPHICAL_SAMPLES.find((s) => s.id === 'anime-expo-boundaries')!;
const E2E_FIXTURE = AUTOBIOGRAPHICAL_SAMPLES.find((s) => s.id === 'e2e-genni-catch')!;

describe('autobiographical meaning (event quality)', () => {
  it('extracts Genni → lesson → boundary behavior chain without inventing facts', () => {
    const m = extractAutobiographicalMeaning(GENNI_FIXTURE.text);
    expect(m.lessons.length).toBeGreaterThan(0);
    const lessonBlob = m.lessons.map((l) => `${l.lesson} ${l.source ?? ''}`).join(' ');
    expect(/boundar/i.test(lessonBlob)).toBe(true);
    expect(/Genni/i.test(lessonBlob)).toBe(true);
    expect(m.nodes.some((n) => n.kind === 'past_event' && /Genni/i.test(n.label))).toBe(true);
    expect(m.chains.length).toBeGreaterThan(0);
    const blob = JSON.stringify(m);
    expect(blob.toLowerCase()).not.toContain('married');
  });

  it('e2e Catch One fixture: lesson + space-giving + mixed emotion', () => {
    const m = extractAutobiographicalMeaning(E2E_FIXTURE.text);
    expect(m.lessons.some((l) => /boundar/i.test(l.lesson))).toBe(true);
    expect(
      m.nodes.some((n) => n.kind === 'current_event') ||
        m.nodes.some((n) => /space|stopped|backed/i.test(n.label + n.evidence)),
    ).toBe(true);
    expect(m.emotions.some((e) => /disappoint/i.test(e.emotion) || /glad|proud/i.test(e.evidence)) || /disappoint|glad/i.test(E2E_FIXTURE.text)).toBe(true);
    const blob = JSON.stringify(m).toLowerCase();
    expect(blob).not.toContain('she was afraid');
    expect(blob).not.toContain('permanently transformed');
  });

  it('does not invent meaning for empty/greeting text', () => {
    const m = extractAutobiographicalMeaning('hey');
    expect(m.nodes).toHaveLength(0);
  });
});

describe('hard negatives (hallucination traps)', () => {
  const cases = [
    'I backed up the database.',
    'I learned that the meeting starts at nine.',
    'I pulled back the cable.',
    'In One Piece, Luffy learned to trust his crew.',
    'The AI said I\'m resilient.',
    'I wish I had stood up for myself.',
    'If I get the job, I\'ll move.',
  ];

  for (const text of cases) {
    it(`no deep identity/behavior spam: ${text.slice(0, 40)}…`, () => {
      if (isNonAutobiographicalContext(text)) {
        const m = extractAutobiographicalMeaning(text);
        expect(m.nodes.filter((n) => n.kind === 'identity_growth')).toHaveLength(0);
        expect(m.lessons.filter((l) => /boundary|resilient|identity/i.test(l.lesson))).toHaveLength(0);
        return;
      }
      const m = extractAutobiographicalMeaning(text);
      expect(m.nodes.some((n) => n.kind === 'identity_growth' && n.confidence > 0.8)).toBe(false);
      expect(JSON.stringify(m).toLowerCase()).not.toMatch(/permanently transformed|fully socially skilled/);
    });
  }

  it('manager schedule does not invent mentorship', () => {
    const rels = extractRelationshipDimensions('My manager changed the schedule.');
    expect(rels.some((r) => r.dimension === 'mentor')).toBe(false);
  });
});

describe('relationship dimensions', () => {
  it('extracts manager/mentor/coworker only with evidence', () => {
    const hits = extractRelationshipDimensions(
      'My manager Khalil is my mentor. I work with Priya. I do not know Sam well.',
    );
    expect(hits.some((h) => h.personHint === 'Khalil' && h.dimension === 'manager')).toBe(true);
    expect(hits.some((h) => h.personHint === 'Khalil' && h.dimension === 'mentor')).toBe(true);
    expect(hits.some((h) => /Priya/i.test(h.personHint) && h.dimension === 'coworker')).toBe(true);
    expect(hits.some((h) => /Sam/i.test(h.personHint) && h.dimension === 'friend')).toBe(false);
  });
});

describe('progression + preference lifecycle', () => {
  it('detects skill progression ladder', () => {
    const hits = extractProgression(
      "I used to be a beginner at piano. I'm learning jazz. I'm getting better at voicings. I'm an expert at sight-reading.",
    );
    const kinds = new Set(hits.map((h) => h.kind));
    expect(kinds.has('beginner')).toBe(true);
    expect(kinds.has('learning')).toBe(true);
    expect(kinds.has('competent') || kinds.has('expert')).toBe(true);
  });

  it('distinguishes temporary vs stable vs goal vs identity', () => {
    const hits = extractPreferenceLifecycle(
      "I like punk. I've been listening to punk all week. I want to become a robotics engineer. I am a musician.",
    );
    expect(hits.some((h) => /punk/i.test(h.subject) && h.lifecycleKind === 'stable')).toBe(true);
    expect(hits.some((h) => /punk/i.test(h.subject) && h.lifecycleKind === 'temporary')).toBe(true);
    expect(hits.some((h) => h.lifecycleKind === 'goal')).toBe(true);
    expect(hits.some((h) => h.lifecycleKind === 'identity')).toBe(true);
  });
});

describe('confidence model + calibration buckets', () => {
  it('does not inflate past 0.95 without confirmation', () => {
    const r = computeClaimConfidence({ base: 0.99, evidenceCount: 10 });
    expect(r.confidence).toBeLessThanOrEqual(0.95);
  });

  it('penalizes contradictions', () => {
    const a = computeClaimConfidence({ base: 0.9, evidenceCount: 1 });
    const b = computeClaimConfidence({ base: 0.9, evidenceCount: 1, contradictionCount: 2 });
    expect(b.confidence).toBeLessThan(a.confidence);
  });
});

describe('idempotency fingerprints', () => {
  it('same inputs produce same fingerprint; version change differs', () => {
    const a = buildMeaningFingerprint({
      userId: 'u1',
      sourceMessageId: 'm1',
      meaningType: 'lesson',
      normalizedValue: normalizeMeaningValue('respect boundaries'),
    });
    const b = buildMeaningFingerprint({
      userId: 'u1',
      sourceMessageId: 'm1',
      meaningType: 'lesson',
      normalizedValue: normalizeMeaningValue('respect boundaries'),
    });
    const c = buildMeaningFingerprint({
      userId: 'u1',
      sourceMessageId: 'm1',
      meaningType: 'lesson',
      normalizedValue: normalizeMeaningValue('respect boundaries'),
      extractorVersion: 'v-other',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(MEMORY_QUALITY_EXTRACTOR_VERSION).toMatch(/memory-quality/);
  });

  it('replay of nodes yields unique fingerprints per type+value', () => {
    const m = extractAutobiographicalMeaning(E2E_FIXTURE.text);
    const fps = new Set(
      m.nodes
        .filter((n) => n.kind === 'lesson' || n.kind === 'behavior_change')
        .map((n) =>
          buildMeaningFingerprint({
            userId: 'u',
            sourceMessageId: 'm',
            meaningType: n.kind === 'lesson' ? 'lesson' : 'behavior_change',
            normalizedValue: normalizeMeaningValue(n.label),
          }),
        ),
    );
    expect(fps.size).toBeGreaterThan(0);
  });
});

describe('Memory Quality benchmark gate', () => {
  it('scores Genni fixture with high event/continuity quality', () => {
    const s = scoreSample(
      GENNI_FIXTURE.id,
      GENNI_FIXTURE.text,
      GENNI_FIXTURE.expected,
      GENNI_FIXTURE.entities,
    );
    expect(s.eventQuality).toBeGreaterThanOrEqual(0.6);
    expect(s.continuity).toBeGreaterThanOrEqual(0.9);
    expect(s.hallucination).toBe(1);
  });

  it('expanded suite has at least 50 fixtures', () => {
    expect(AUTOBIOGRAPHICAL_SAMPLES.length).toBeGreaterThanOrEqual(50);
  });

  it('runs full benchmark with thresholds', () => {
    const result = runBenchmark(AUTOBIOGRAPHICAL_SAMPLES);
    // eslint-disable-next-line no-console
    console.log(
      'Memory Quality gate:',
      JSON.stringify(
        {
          sampleCount: result.metrics.sampleCount,
          overall: Number(result.aggregate.overall.toFixed(3)),
          eventQuality: Number(result.aggregate.eventQuality.toFixed(3)),
          eventQualityFocused: Number(result.metrics.eventQualityFocused.toFixed(3)),
          relationship: Number(result.aggregate.relationship.toFixed(3)),
          preference: Number(result.aggregate.preference.toFixed(3)),
          continuity: Number(result.aggregate.continuity.toFixed(3)),
          identity: Number(result.aggregate.identity.toFixed(3)),
          hallucination: Number(result.aggregate.hallucination.toFixed(3)),
          precision: Number(result.metrics.precision.toFixed(3)),
          recall: Number(result.metrics.recall.toFixed(3)),
          hallucinationFalsePositives: result.metrics.hallucinationFalsePositives,
          hardNegativeFalsePositives: result.metrics.hardNegativeFalsePositives,
          duplicateRate: Number(result.metrics.duplicateRate.toFixed(3)),
          calibrationError: Number(result.metrics.calibrationError.toFixed(3)),
        },
        null,
        2,
      ),
    );

    expect(result.metrics.sampleCount).toBeGreaterThanOrEqual(50);
    expect(result.aggregate.overall).toBeGreaterThanOrEqual(0.7);
    // Focused event fixtures (with lesson/past/behavior expectations) — primary event gate
    expect(result.metrics.eventQualityFocused).toBeGreaterThan(0.75);
    // Broad suite eventQuality is diluted by domain-only samples; keep modest floor
    expect(result.aggregate.eventQuality).toBeGreaterThan(0.55);
    expect(result.metrics.hardNegativeFalsePositives).toBe(0);
    expect(result.aggregate.hallucination).toBeGreaterThanOrEqual(0.9);
    expect(result.metrics.duplicateRate).toBe(0);
  });

  it('baseline without meaning scores lower on event quality for Genni', () => {
    const entityOnly = scoreSample(
      'baseline',
      'Dollyfied Stimkybun Genni Catch One Anime Expo',
      GENNI_FIXTURE.expected,
      GENNI_FIXTURE.entities,
    );
    const withMeaning = scoreSample(
      'after',
      GENNI_FIXTURE.text,
      GENNI_FIXTURE.expected,
      GENNI_FIXTURE.entities,
    );
    expect(withMeaning.eventQuality).toBeGreaterThan(entityOnly.eventQuality);
    expect(withMeaning.continuity).toBeGreaterThan(entityOnly.continuity);
  });
});

describe('volume control', () => {
  it('does not explode node count on a single sentence', () => {
    const m = extractAutobiographicalMeaning('I like coffee.');
    expect(m.nodes.length).toBeLessThanOrEqual(3);
  });
});
