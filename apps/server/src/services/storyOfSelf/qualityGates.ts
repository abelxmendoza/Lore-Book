/**
 * Quality gates run on every Story of Self result before it is returned.
 *
 * The leakage validator is the hard gate: rendered prose must never contain
 * raw conversation fragments, assistant failure text, JSON, or long verbatim
 * spans of stored evidence. The other gates check structure — duplicates,
 * unsupported dramatic labels, year-only chapter names, coverage, and theme
 * support — and feed a structured report the engine can retry against.
 */
import type {
  CanonicalEvent,
  EvidenceRecord,
  NarrativeSynthesisResult,
  TurningPointAssessment,
} from './narrativeRecords';

export interface GateResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const PIPELINE_TEXT_RE =
  /\b(over capacity|rate limit|something went wrong|try again later|i wasn'?t able to|internal (server )?error|as an ai\b|retriev(ed|al) (chunk|snippet)|system prompt)\b/i;

function normalizeParagraph(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function validateLeakage(
  prose: string,
  records: EvidenceRecord[]
): GateResult {
  const problems: string[] = [];

  if (PIPELINE_TEXT_RE.test(prose)) problems.push('contains pipeline/failure text');
  if (/[?!]{3,}/.test(prose)) problems.push('contains interjection punctuation bursts');
  if (/[{[]\s*"(?:[\w-]+)"\s*:/.test(prose)) problems.push('contains raw JSON');

  // Quarantined records must never appear at all; usable evidence must not be
  // dumped verbatim in long spans (short derived summaries are fine).
  for (const record of records) {
    const raw = record.text.trim();
    if (!raw) continue;
    if (record.kind !== 'usable') {
      if (raw.length >= 8 && prose.toLowerCase().includes(raw.toLowerCase())) {
        problems.push(`contains quarantined ${record.kind} text (evidence ${record.id})`);
      }
    } else if (raw.length >= 200 && prose.includes(raw)) {
      problems.push(`contains ≥200-char verbatim evidence dump (evidence ${record.id})`);
    }
  }

  return {
    name: 'no_raw_transcript_leakage',
    passed: problems.length === 0,
    detail: problems.join('; ') || undefined,
  };
}

export function runQualityGates(input: {
  prose: string;
  synthesis: NarrativeSynthesisResult;
  events: CanonicalEvent[];
  records: EvidenceRecord[];
  turningPoints: TurningPointAssessment[];
  collisionWarnings: string[];
}): GateResult[] {
  const { prose, synthesis, events, records, turningPoints, collisionWarnings } = input;
  const gates: GateResult[] = [];

  gates.push(validateLeakage(prose, records));

  const paragraphs = prose
    .split(/\n{2,}/)
    .map(normalizeParagraph)
    .filter((p) => p.length > 40);
  const dupParagraphs = paragraphs.filter((p, i) => paragraphs.indexOf(p) !== i);
  gates.push({
    name: 'no_duplicate_paragraphs',
    passed: dupParagraphs.length === 0,
    detail: dupParagraphs.length ? `${dupParagraphs.length} repeated paragraph(s)` : undefined,
  });

  const referencedEventIds = synthesis.lifeChapters.flatMap((c) => c.eventIds);
  const repeatedEvents = referencedEventIds.filter(
    (id, i) => referencedEventIds.indexOf(id) !== i
  );
  gates.push({
    name: 'no_repeated_canonical_event',
    passed: repeatedEvents.length === 0,
    detail: repeatedEvents.length ? `events repeated across chapters: ${repeatedEvents.join(', ')}` : undefined,
  });

  gates.push({
    name: 'no_entity_collision_warnings',
    passed: collisionWarnings.length === 0,
    detail: collisionWarnings[0],
  });

  const unsupported = turningPoints.filter(
    (tp) =>
      tp.accepted &&
      tp.arcLabel !== 'ordinary_event' &&
      tp.arcLabel !== 'transition' &&
      tp.confidence < 0.5
  );
  gates.push({
    name: 'no_unsupported_dramatic_labels',
    passed: unsupported.length === 0,
    detail: unsupported.length
      ? `low-confidence dramatic labels: ${unsupported.map((t) => t.arcLabel).join(', ')}`
      : undefined,
  });

  const yearOnly = synthesis.lifeChapters.filter((c) =>
    /^(the\s+)?(era of\s+)?\d{4}(\s*[-–]\s*\d{4})?$/i.test(c.title.trim())
  );
  gates.push({
    name: 'no_year_only_chapters',
    passed: yearOnly.length === 0,
    detail: yearOnly.length ? yearOnly.map((c) => c.title).join(', ') : undefined,
  });

  // Longitudinal coverage: rendered chapters should span most of the corpus.
  const evidenceDates = records
    .filter((r) => r.kind === 'usable' && r.date)
    .map((r) => r.date!)
    .sort();
  const corpusSpanMs =
    evidenceDates.length > 1
      ? Date.parse(evidenceDates[evidenceDates.length - 1]) - Date.parse(evidenceDates[0])
      : 0;
  const chapterDates = synthesis.lifeChapters
    .flatMap((c) => [c.startTime, c.endTime])
    .filter((d): d is string => Boolean(d))
    .sort();
  const chapterSpanMs =
    chapterDates.length > 1
      ? Date.parse(chapterDates[chapterDates.length - 1]) - Date.parse(chapterDates[0])
      : 0;
  const sixMonthsMs = 182 * 86_400_000;
  gates.push({
    name: 'sufficient_longitudinal_coverage',
    passed: corpusSpanMs < sixMonthsMs || chapterSpanMs >= corpusSpanMs * 0.6,
    detail:
      corpusSpanMs >= sixMonthsMs && chapterSpanMs < corpusSpanMs * 0.6
        ? 'chapters cover under 60% of the available history'
        : undefined,
  });

  const identityRecords = records.filter(
    (r) => r.kind === 'usable' && (r.recordType === 'identity_fact' || r.recordType === 'relationship_fact')
  );
  gates.push({
    name: 'sufficient_identity_coverage',
    passed: identityRecords.length === 0 || synthesis.identitySummary.trim().length > 40,
    detail:
      identityRecords.length > 0 && synthesis.identitySummary.trim().length <= 40
        ? 'identity facts exist but the identity summary is empty/thin'
        : undefined,
  });

  // Recency balance: recent events may lead, but they can't be the whole story.
  const eventById = new Map(events.map((e) => [e.id, e]));
  const chapterEvents = referencedEventIds
    .map((id) => eventById.get(id))
    .filter((e): e is CanonicalEvent => Boolean(e) && Boolean(e!.startTime));
  const cutoff = evidenceDates.length
    ? Date.parse(evidenceDates[evidenceDates.length - 1]) - 90 * 86_400_000
    : 0;
  const recentCount = chapterEvents.filter((e) => Date.parse(e.startTime!) >= cutoff).length;
  gates.push({
    name: 'recent_events_do_not_dominate',
    passed:
      corpusSpanMs < 365 * 86_400_000 ||
      chapterEvents.length === 0 ||
      recentCount / chapterEvents.length <= 0.5,
    detail:
      corpusSpanMs >= 365 * 86_400_000 && chapterEvents.length > 0 && recentCount / chapterEvents.length > 0.5
        ? 'over half of narrative events are from the last 90 days despite years of history'
        : undefined,
  });

  const thinThemes = synthesis.themes.filter((t) => t.supportingEventIds.length < 2);
  gates.push({
    name: 'themes_have_multiple_evidence_sources',
    passed: thinThemes.length === 0,
    detail: thinThemes.length ? thinThemes.map((t) => t.label).join('; ') : undefined,
  });

  gates.push({
    name: 'uncertainties_surfaced',
    passed: Array.isArray(synthesis.uncertainties),
  });

  const sentences = synthesis.identitySummary.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  gates.push({
    name: 'final_prose_is_synthesized',
    passed: sentences.length >= 2 && !/^•|-\s/m.test(synthesis.identitySummary),
    detail:
      sentences.length < 2 ? 'identity summary is not multi-sentence prose' : undefined,
  });

  return gates;
}

export function gatesToRecord(gates: GateResult[]): Record<string, boolean> {
  return Object.fromEntries(gates.map((g) => [g.name, g.passed]));
}
