import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import { composerMatchSlot } from '../store/slices/composerSlice';
import type { CertifiedEntityType } from '../types/certifiedEntity';

import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import type { EntityColorKey } from './entityColorMap';
import { findEntityHighlightRanges } from './entityHighlightRanges';
import { isVisibleEntityCandidate } from './lexicalCandidateKinds';
import { isLexicalNoiseToken } from './lexicalNoiseTokens';
import { isSelfBleedLabel } from './selfChipLabel';

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
    case 'project':
      return { type: 'PROJECT', colorKey: 'project' };
    case 'thing':
      return { type: 'THING', colorKey: 'thing' };
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
  const chipCertified = dedupeCertifiedForStrip(certified);
  if (spans.length === 0) return spans;

  const entityOnly = spans.filter((span) => isVisibleEntityCandidate(span.text));
  if (chipCertified.length === 0) return dedupePreviewSpans(entityOnly);

  const ranges = findEntityHighlightRanges(text, chipCertified);
  const certifiedNames = new Set(chipCertified.flatMap(nameKeysForMatch));

  return dedupePreviewSpans(
    entityOnly.filter((span) => {
      const overlaps = ranges.some((r) => span.start < r.end && span.end > r.start);
      if (overlaps) return false;
      const spanKey = normalizeKey(span.text);
      if (certifiedNames.has(spanKey)) return false;
      return !chipCertified.some((m) =>
        nameKeysForMatch(m).some((k) => k.includes(spanKey) || spanKey.includes(k)),
      );
    }),
  );
}

/** Remove duplicate certified chips (same normalized name or overlapping id). */
export function dedupeCertifiedForStrip(certified: CertifiedEntityMatch[]): CertifiedEntityMatch[] {
  const chipCertified = certified.filter((e) => {
    if (e.matchKind === 'prefix') return false;
    const label = e.matchedLabel ?? e.name;
    // Bare self pronouns / bleed stay off the strip — resolved as You internally.
    if (isSelfBleedLabel(label) || isLexicalNoiseToken(label)) return false;
    return true;
  });
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const out: CertifiedEntityMatch[] = [];

  const priority = (m: CertifiedEntityMatch) => {
    if (m.status === 'confirmed' || !m.status) return 3;
    if (m.status === 'suggestion') return 2;
    return 1;
  };

  const sorted = [...chipCertified].sort((a, b) => priority(b) - priority(a));

  for (const match of sorted) {
    const slot = composerMatchSlot(match);
    if (seenIds.has(slot)) continue;

    const nameKeys = nameKeysForMatch(match);
    const dupName = nameKeys.some((k) => seenNames.has(k));
    if (dupName) continue;

    seenIds.add(slot);
    for (const k of nameKeys) seenNames.add(k);
    out.push(match);
  }

  return out;
}

function dedupePreviewSpans(spans: LexicalPreviewSpan[]): LexicalPreviewSpan[] {
  const seen = new Set<string>();
  const out: LexicalPreviewSpan[] = [];
  for (const span of spans) {
    const key = `${normalizeKey(span.text)}:${span.start}:${span.end}`;
    const nameKey = normalizeKey(span.text);
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);
    seen.add(key);
    out.push(span);
  }
  return out;
}
