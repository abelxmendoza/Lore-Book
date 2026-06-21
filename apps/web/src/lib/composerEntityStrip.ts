import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { findEntityHighlightRanges } from './entityHighlightRanges';
import type { CertifiedEntityType } from '../types/certifiedEntity';
import type { EntityColorKey } from './entityColorMap';

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function nameKeysForMatch(match: CertifiedEntityMatch): string[] {
  return [match.name, match.matchedLabel, ...match.aliases]
    .filter(Boolean)
    .map(normalizeKey);
}

/** Map book entity type → lexical preview classification (for consistent colors). */
export function certifiedTypeToPreviewClassification(
  match: Pick<CertifiedEntityMatch, 'type' | 'characterVariant'>,
): { type: string; colorKey: EntityColorKey } {
  if (match.type === 'character' && match.characterVariant === 'romantic') {
    return { type: 'RELATIONSHIP', colorKey: 'relationship' };
  }
  switch (match.type) {
    case 'character':
      return { type: 'PERSON', colorKey: 'person' };
    case 'location':
      return { type: 'PLACE', colorKey: 'place' };
    case 'organization':
      return { type: 'ORGANIZATION', colorKey: 'organization' };
    case 'skill':
      return { type: 'SKILL', colorKey: 'skill' };
    case 'event':
      return { type: 'EVENT', colorKey: 'event' };
    default:
      return { type: 'PERSON', colorKey: 'person' };
  }
}

export function certifiedTypeToPreviewType(type: CertifiedEntityType): string {
  return certifiedTypeToPreviewClassification({ type }).type;
}

/** Drop preview spans that duplicate a certified match (position or name). */
export function filterPreviewSpansForStrip(
  text: string,
  certified: CertifiedEntityMatch[],
  spans: LexicalPreviewSpan[],
): LexicalPreviewSpan[] {
  const chipCertified = certified.filter((e) => e.matchKind !== 'prefix');
  if (spans.length === 0 || chipCertified.length === 0) return spans;

  const ranges = findEntityHighlightRanges(text, chipCertified);
  const certifiedNames = new Set(chipCertified.flatMap(nameKeysForMatch));

  return spans.filter((span) => {
    const overlaps = ranges.some((r) => span.start < r.end && span.end > r.start);
    if (overlaps) return false;
    const spanKey = normalizeKey(span.text);
    if (certifiedNames.has(spanKey)) return false;
    return !chipCertified.some((m) =>
      nameKeysForMatch(m).some((k) => k.includes(spanKey) || spanKey.includes(k)),
    );
  });
}
