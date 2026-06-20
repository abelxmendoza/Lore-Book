import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import { PREVIEW_PATTERNS } from './lexicalPreviewPatterns';

/** Client-side fallback when preview API is unavailable (demo / offline). */
export function clientLexicalPreviewSpans(text: string): LexicalPreviewSpan[] {
  if (!text.trim()) return [];

  const spans: LexicalPreviewSpan[] = [];
  for (const pattern of PREVIEW_PATTERNS) {
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(text)) !== null) {
      spans.push({
        text: m[0],
        start: m.index,
        end: m.index + m[0].length,
        type: pattern.type,
        subtype: pattern.subtype,
        colorKey: pattern.colorKey,
        confidence: pattern.confidence,
        temporary: true,
        needsReview: pattern.needsReview,
        entityStatus: 'new',
      });
    }
  }

  return dedupeSpans(spans);
}

function dedupeSpans(spans: LexicalPreviewSpan[]): LexicalPreviewSpan[] {
  const sorted = [...spans].sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept: LexicalPreviewSpan[] = [];
  for (const span of sorted) {
    const contained = kept.some((k) => k.start <= span.start && span.end <= k.end);
    if (contained) continue;
    const overlapSame = kept.some(
      (k) =>
        span.start < k.end &&
        span.end > k.start &&
        (k.colorKey === span.colorKey || k.type === span.type)
    );
    if (!overlapSame) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}
