/**
 * Shared empty-foundation detection for recall.
 * Foundation routers still return a context block like
 * `Location not recorded.` — that is not evidence and must not
 * block the journal/units fallback (RC-2 / Costco-class misses).
 */

const EMPTY_FOUNDATION_MARKERS = [
  'No biography snapshot yet.',
  'No biography data available yet.',
  'No characters recorded yet.',
  'No family members recorded yet.',
  'No character record found for',
  'Location not recorded.',
  'Work/career information not recorded.',
];

export function hasFoundationContent(block: string | null | undefined): boolean {
  const trimmed = block?.trim() ?? '';
  if (!trimmed) return false;
  return !EMPTY_FOUNDATION_MARKERS.some((marker) => trimmed === marker || trimmed.startsWith(marker));
}
