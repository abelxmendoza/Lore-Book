import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { certifiedTypeToPreviewClassification } from './composerEntityStrip';

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
    const spanKey = normalizeKey(span.text);

    for (const match of confirmed) {
      if (labelsForMatch(match).some((l) => l === spanKey || spanKey.includes(l) || l.includes(spanKey))) {
        const classification = certifiedTypeToPreviewClassification(match);
        return {
          ...span,
          type: classification.type,
          colorKey: classification.colorKey,
          entityStatus: 'known',
          matchedEntityId: match.id,
          matchedEntityName: match.name,
          needsReview: false,
        };
      }
    }

    for (const match of suggested) {
      if (labelsForMatch(match).some((l) => l === spanKey || spanKey.includes(l) || l.includes(spanKey))) {
        const classification = certifiedTypeToPreviewClassification(match);
        return {
          ...span,
          type: classification.type,
          colorKey: classification.colorKey,
          entityStatus: 'new',
          needsReview: span.needsReview ?? true,
          matchedEntityName: match.name,
        };
      }
    }

    return { ...span, entityStatus: span.entityStatus ?? 'new' };
  });
}
