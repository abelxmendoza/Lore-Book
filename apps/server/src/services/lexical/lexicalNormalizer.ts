/**
 * Text normalization for deterministic lexical matching.
 */

export function normalizeLexicalText(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\u2014|\u2013/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pad text for boundary-safe substring scans. */
export function padForScan(text: string): string {
  return ` ${normalizeLexicalText(text)} `;
}

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
