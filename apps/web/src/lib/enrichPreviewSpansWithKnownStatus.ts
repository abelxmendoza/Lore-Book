import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function labelsForMatch(match: CertifiedEntityMatch): string[] {
  return [match.name, match.matchedLabel, ...match.aliases]
    .filter(Boolean)
    .map(normalizeKey);
}

/** Merge server entityStatus with client certified-index matches for composer highlights. */
export function enrichPreviewSpansWithKnownStatus(
  spans: LexicalPreviewSpan[],
  matches: CertifiedEntityMatch[]
): LexicalPreviewSpan[] {
  const confirmed = matches.filter((m) => m.status !== 'draft' && m.status !== 'suggestion');
  const suggested = matches.filter((m) => m.status === 'suggestion' || m.status === 'draft');

  return spans.map((span) => {
    if (span.entityStatus === 'known') return span;

    const spanKey = normalizeKey(span.text);

    for (const match of confirmed) {
      if (labelsForMatch(match).some((l) => l === spanKey || spanKey.includes(l) || l.includes(spanKey))) {
        return {
          ...span,
          entityStatus: 'known',
          matchedEntityId: match.id,
          matchedEntityName: match.name,
        };
      }
    }

    for (const match of suggested) {
      if (labelsForMatch(match).some((l) => l === spanKey || spanKey.includes(l) || l.includes(spanKey))) {
        return {
          ...span,
          entityStatus: 'new',
          needsReview: span.needsReview ?? true,
        };
      }
    }

    return { ...span, entityStatus: span.entityStatus ?? 'new' };
  });
}
