/**
 * Story of Self — autobiographical synthesis pipeline.
 *
 *   normalize evidence (quarantine chat fragments / system artifacts)
 *   → resolve canonical entities (honoring separation constraints)
 *   → classify record types (identity/entity/relationship facts vs events)
 *   → cluster duplicate evidence into canonical events
 *   → score autobiographical importance (foundational > recent-by-default)
 *   → assess turning points (before/after change required; rejects traced)
 *   → build life chapters, themes, current chapter
 *   → synthesize prose from the structured result only
 *   → run quality gates; remediate + re-render once on failure
 *
 * Replaces the old regex-labels-plus-raw-text-concatenation engine that
 * produced "Era of 2026", duplicate paragraphs, and transcript leakage.
 */
import { randomUUID } from 'crypto';

import type { MemoryEntry } from '../../types';

import {
  buildLifeChapters,
  inferThemes,
  synthesizeCurrentChapter,
} from './chapterAndThemes';
import { resolveEntities } from './entityResolution';
import { clusterCanonicalEvents } from './eventClustering';
import { normalizeEvidence } from './evidenceNormalizer';
import { scoreEvents } from './importanceScoring';
import {
  FOUNDATIONAL_DOMAINS,
  type CanonicalEvent,
  type EvidenceRecord,
  type KnownEntity,
  type NarrativeSynthesisResult,
  type StoryOfSelfTrace,
  type TurningPointAssessment,
  type Uncertainty,
} from './narrativeRecords';
import { renderNarrative } from './narrativeRenderer';
import { gatesToRecord, runQualityGates, type GateResult } from './qualityGates';
import { assessTurningPoints } from './turningPointAssessment';
import type { NarrativeMode, StoryOfSelf, TurningPoint } from './types';

export interface StoryOfSelfContext {
  entries: MemoryEntry[];
  /** Canonical entity roster; resolution and collision guards need it. */
  entities?: KnownEntity[];
  queryIntent?: string;
  now?: Date;
}

const LEGACY_CATEGORY: Record<string, TurningPoint['category']> = {
  victory: 'victory',
  fall: 'fall',
  awakening: 'awakening',
  transition: 'transition',
  conflict: 'conflict',
  ordinary_event: 'ordinary_event',
};

export class StoryOfSelfEngine {
  async process(ctx: StoryOfSelfContext): Promise<StoryOfSelf> {
    const entities = ctx.entities ?? [];
    const now = ctx.now ?? new Date();

    // 1–3. Normalize, resolve entities, classify.
    const normalized = normalizeEvidence(ctx.entries);
    const { records, constraints, collisionWarnings } = resolveEntities(normalized, entities);

    const usable = records.filter((r) => r.kind === 'usable');
    const eventRecords = usable.filter(
      (r) => r.recordType === 'event' || r.recordType === 'current_state'
    );
    const identityRecords = usable.filter(
      (r) => r.recordType === 'identity_fact' || r.recordType === 'relationship_fact'
    );
    const uncertaintyRecords = usable.filter((r) => r.recordType === 'uncertainty');

    // 4–5. Cluster into canonical events, score importance.
    const { events, duplicateClusters } = clusterCanonicalEvents(
      eventRecords,
      constraints,
      entities
    );
    const ranked = scoreEvents(events, eventRecords, entities, now);

    // 6. Turning points with rejection reasons.
    const evidenceById = new Map(eventRecords.map((r) => [r.id, r]));
    const latestDate = eventRecords
      .map((r) => r.date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop();
    const assessments = assessTurningPoints(events, evidenceById, { latestDate });
    const accepted = assessments.filter((a) => a.accepted);

    // 7. Chapters, themes, current chapter.
    const chapters = buildLifeChapters(events, assessments, entities);
    const themes = inferThemes(events, chapters, evidenceById);
    const currentChapter = synthesizeCurrentChapter(chapters, events, assessments, records);

    const uncertainties: Uncertainty[] = uncertaintyRecords.slice(0, 5).map((r) => ({
      description: firstClause(r.text),
      evidenceIds: [r.id],
    }));

    let synthesis: NarrativeSynthesisResult = {
      identitySummary: buildIdentitySummary(identityRecords, ranked, chapters),
      lifeChapters: chapters,
      turningPoints: accepted,
      themes,
      currentChapter,
      uncertainties,
      evidenceMap: Object.fromEntries(events.map((e) => [e.id, e.evidenceIds])),
    };

    // 8–9. Render, gate, remediate once, re-gate.
    let prose = renderNarrative(synthesis);
    let gates = runQualityGates({
      prose,
      synthesis,
      events,
      records,
      turningPoints: assessments,
      collisionWarnings,
    });
    if (gates.some((g) => !g.passed)) {
      synthesis = remediate(synthesis, gates);
      prose = renderNarrative(synthesis);
      gates = runQualityGates({
        prose,
        synthesis,
        events,
        records,
        turningPoints: synthesis.turningPoints,
        collisionWarnings,
      });
    }

    const trace: StoryOfSelfTrace = {
      queryIntent: ctx.queryIntent ?? 'story_of_self',
      retrievedEvidenceCount: ctx.entries.length,
      usableEvidenceCount: usable.length,
      filteredFragmentCount: records.length - usable.length,
      dateRangeCovered: dateRange(usable),
      domainCoverage: domainCoverage(usable),
      canonicalEventCount: events.length,
      duplicateClusters,
      rejectedTurningPoints: assessments
        .filter((a) => !a.accepted)
        .map((a) => ({ candidateId: a.eventId, reason: a.rejectionReason ?? 'unknown' })),
      selectedTurningPoints: synthesis.turningPoints.map((a) => a.eventId),
      selectedChapterIds: synthesis.lifeChapters.map((c) => c.id),
      selectedThemeIds: synthesis.themes.map((t) => t.id),
      entityCollisionWarnings: collisionWarnings,
      leakageCheckPassed: gates.find((g) => g.name === 'no_raw_transcript_leakage')?.passed ?? false,
      qualityGateResults: gatesToRecord(gates),
    };

    return {
      id: randomUUID(),
      themes: synthesis.themes.map((t) => ({
        id: t.id,
        theme: t.label,
        evidence: t.supportingEventIds,
        strength: t.confidence,
      })),
      turningPoints: synthesis.turningPoints.map((a) => ({
        id: a.eventId,
        timestamp: eventStart(events, a.eventId) ?? '',
        description: a.event,
        category: LEGACY_CATEGORY[a.arcLabel] ?? 'transition',
        emotionalImpact: a.magnitude,
      })),
      mode: inferNarrativeMode(synthesis),
      arcs: synthesis.lifeChapters.map((c) => ({
        title: c.title,
        era: eraLabel(c.startTime, c.endTime),
        content: c.summary,
        themes: synthesis.themes
          .filter((t) => t.chapterIds.includes(c.id))
          .map((t) => t.label),
      })),
      coherence: {
        coherenceScore:
          gates.length === 0 ? 0.5 : gates.filter((g) => g.passed).length / gates.length,
        contradictions: [],
        missingPieces: gates.filter((g) => !g.passed).map((g) => g.detail ?? g.name),
      },
      voicePrint: '',
      summary: prose,
      synthesis,
      trace,
    };
  }
}

function firstClause(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.length > 140 ? `${first.slice(0, 137)}…` : first;
}

function eventStart(events: CanonicalEvent[], id: string): string | undefined {
  return events.find((e) => e.id === id)?.startTime;
}

function eraLabel(start?: string, end?: string): string {
  const a = start?.slice(0, 4);
  const b = end?.slice(0, 4);
  if (a && b && a !== b) return `${a}–${b}`;
  return a ?? b ?? 'undated';
}

function dateRange(records: EvidenceRecord[]): { earliest?: string; latest?: string } {
  const dates = records.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

function domainCoverage(records: EvidenceRecord[]): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const r of records) {
    for (const d of r.domains) coverage[d] = (coverage[d] ?? 0) + 1;
  }
  return coverage;
}

/**
 * Identity summary: durable self-facts plus the most important foundational
 * events, phrased as prose. Uses only first sentences of identity records
 * (short, processed) — never event transcripts.
 */
function buildIdentitySummary(
  identityRecords: EvidenceRecord[],
  rankedEvents: CanonicalEvent[],
  chapters: { title: string }[]
): string {
  const sentences: string[] = [];

  const facts = identityRecords
    .slice(0, 4)
    .map((r) => {
      const fact = firstClause(r.text).replace(/\.$/, '');
      return `${fact}.`;
    });
  sentences.push(...facts);

  const foundational = rankedEvents
    .filter((e) => e.domains.some((d) => FOUNDATIONAL_DOMAINS.has(d)))
    .slice(0, 2)
    .map((e) => `“${e.title.replace(/\.$/, '')}”`);
  if (foundational.length > 0) {
    sentences.push(
      `The record is anchored by moments like ${joinNaturally(foundational)} — the kind of ground the rest of the story stands on.`
    );
  }

  if (chapters.length > 1) {
    sentences.push(`The story so far falls into ${chapters.length} chapters.`);
  } else if (sentences.length === 0) {
    sentences.push(
      'There is not yet enough longitudinal evidence to state who you are with confidence; what follows is what the record supports so far.'
    );
  }

  return sentences.join(' ');
}

function joinNaturally(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Narrative mode stays in the legacy contract, but it is now derived from
 * chapter/theme structure and marked tentative below 0.55 confidence rather
 * than presented as firm truth.
 */
function inferNarrativeMode(synthesis: NarrativeSynthesisResult): NarrativeMode {
  const themeText = synthesis.themes.map((t) => t.label).join(' ').toLowerCase();
  const scores: Partial<Record<NarrativeMode['mode'], number>> = {};
  const add = (mode: NarrativeMode['mode'], amount: number) => {
    scores[mode] = (scores[mode] ?? 0) + amount;
  };

  if (/build|system|structure|project/.test(themeText)) add('builder', 0.4);
  if (/proving|unfamiliar|competence|mastery/.test(themeText)) add('warrior', 0.3);
  if (/belonging|community/.test(themeText)) add('protector', 0.2);
  if (/discipline|training/.test(themeText)) add('sage', 0.2);
  for (const theme of synthesis.themes) {
    if (theme.chapterIds.length >= 2) add('builder', 0.05);
  }

  const top = (Object.entries(scores) as [NarrativeMode['mode'], number][]).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const confidence = Math.min(1, top?.[1] ?? 0.3);
  return {
    mode: top?.[0] ?? 'builder',
    confidence,
    tentative: confidence < 0.55,
  };
}

/** Structured remediation applied when a quality gate fails, before re-render. */
function remediate(
  synthesis: NarrativeSynthesisResult,
  gates: GateResult[]
): NarrativeSynthesisResult {
  const failed = new Set(gates.filter((g) => !g.passed).map((g) => g.name));
  let next = { ...synthesis };

  if (failed.has('no_unsupported_dramatic_labels')) {
    next = {
      ...next,
      turningPoints: next.turningPoints.map((tp): TurningPointAssessment =>
        tp.arcLabel !== 'ordinary_event' && tp.arcLabel !== 'transition' && tp.confidence < 0.5
          ? { ...tp, arcLabel: 'transition', reasoning: `${tp.reasoning}; downgraded by quality gate` }
          : tp
      ),
    };
  }

  if (failed.has('themes_have_multiple_evidence_sources')) {
    next = { ...next, themes: next.themes.filter((t) => t.supportingEventIds.length >= 2) };
  }

  if (failed.has('no_year_only_chapters')) {
    next = {
      ...next,
      lifeChapters: next.lifeChapters.map((c) =>
        /^(the\s+)?(era of\s+)?\d{4}(\s*[-–]\s*\d{4})?$/i.test(c.title.trim())
          ? { ...c, title: `A Season of ${c.definingContext || 'Change'}` }
          : c
      ),
    };
  }

  if (failed.has('no_duplicate_paragraphs') || failed.has('no_repeated_canonical_event')) {
    const seenEvents = new Set<string>();
    next = {
      ...next,
      lifeChapters: next.lifeChapters.map((c) => {
        const eventIds = c.eventIds.filter((id) => {
          if (seenEvents.has(id)) return false;
          seenEvents.add(id);
          return true;
        });
        return { ...c, eventIds };
      }),
    };
  }

  return next;
}
