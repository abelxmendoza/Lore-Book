/**
 * Renders user-facing prose from the structured synthesis result — and only
 * from it. Raw evidence never flows through this module; every sentence here
 * is built from records that already survived normalization, clustering,
 * classification, and the quality gates. Evidence references stay in the
 * evidenceMap and are rendered only as concise counts when sources are
 * explicitly requested.
 */
import type { NarrativeSynthesisResult, TurningPointAssessment } from './narrativeRecords';

function formatWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function turningPointSentence(tp: TurningPointAssessment): string {
  const clause = tp.event.replace(/\.$/, '');
  const labelPhrase: Record<string, string> = {
    victory: 'A real victory came when',
    fall: 'A genuine setback came when',
    awakening: 'A durable shift in understanding came when',
    conflict: 'A sustained struggle surfaced when',
    transition: 'A major transition came when',
    ordinary_event: 'A notable moment came when',
  };
  const lead = labelPhrase[tp.arcLabel] ?? 'A turning point came when';
  const after = tp.afterState
    ? ` What followed — ${tp.afterState.replace(/\.$/, '').toLowerCase()} — shows the change held.`
    : '';
  return `${lead} ${lowercaseFirst(clause)}.${after}`;
}

function lowercaseFirst(s: string): string {
  // Don't lowercase the pronoun "I", names, or acronyms; only a leading
  // article/ordinary word.
  const first = s.split(' ')[0];
  if (first === 'I' || first.startsWith("I'")) return s;
  if (first.length > 1 && first === first.toUpperCase()) return s;
  if (/^[A-Z][a-z]/.test(first) && !/^(The|A|An|My|Our|This|That|Another)$/.test(first)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function renderNarrative(
  synthesis: NarrativeSynthesisResult,
  options: { includeSources?: boolean } = {}
): string {
  const parts: string[] = [];

  parts.push(synthesis.identitySummary);

  for (const chapter of synthesis.lifeChapters) {
    const start = formatWhen(chapter.startTime);
    const end = formatWhen(chapter.endTime);
    const when =
      start && end && start !== end ? `${start} to ${end}` : (start ?? end);
    const opening = when ? `**${chapter.title}** (${when}).` : `**${chapter.title}**.`;
    const tpsInChapter = synthesis.turningPoints.filter(
      (tp) => tp.accepted && chapter.eventIds.includes(tp.eventId)
    );
    const tpText = tpsInChapter.map(turningPointSentence).join(' ');
    parts.push([opening, chapter.summary, tpText].filter(Boolean).join(' '));
  }

  if (synthesis.themes.length > 0) {
    const themeLines = synthesis.themes
      .slice(0, 4)
      .map((t) => `${t.label} — ${t.description}`)
      .join(' ');
    parts.push(`Running through these chapters: ${themeLines}`);
  }

  if (synthesis.currentChapter) {
    const cc = synthesis.currentChapter;
    const tensionText = cc.openTensions.length
      ? ` Still open: ${cc.openTensions.join('; ')}.`
      : '';
    const pursuitText = cc.activePursuits.length
      ? ` Right now the energy is going into ${cc.activePursuits.join(', ')}.`
      : '';
    parts.push(
      `The current chapter ${cc.trajectory}. Most recently: ${cc.whatChanged}.${pursuitText}${tensionText}`
    );
  }

  if (synthesis.uncertainties.length > 0) {
    parts.push(
      `Some threads are still unclear: ${synthesis.uncertainties
        .slice(0, 3)
        .map((u) => u.description)
        .join('; ')}.`
    );
  }

  if (options.includeSources) {
    const counts = Object.entries(synthesis.evidenceMap)
      .map(([eventId, ids]) => `${eventId.slice(0, 8)}: ${ids.length} record(s)`)
      .slice(0, 10)
      .join(', ');
    if (counts) parts.push(`Sources — ${counts}.`);
  }

  return parts.filter((p) => p.trim().length > 0).join('\n\n');
}
