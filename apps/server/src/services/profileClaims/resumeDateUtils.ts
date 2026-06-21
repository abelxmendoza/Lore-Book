/** Month-name and range parsing for resume dates (e.g. "Apr 2026 – Present"). */

const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

export function parseMonthYearToken(token: string): string | null {
  const t = token.trim().replace(/\.$/, '');
  if (/^present|current|now$/i.test(t)) return null;

  const iso = t.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;

  const yearOnly = t.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;

  const named = t.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const m = MONTHS[named[1].toLowerCase()];
    if (m) return `${named[2]}-${m}-01`;
  }

  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

export function normalizeResumeDate(raw?: string | null, fallbackToNow = false): string | null {
  if (!raw || /^present|current|now$/i.test(raw.trim())) {
    return fallbackToNow ? new Date().toISOString().split('T')[0] : null;
  }
  return parseMonthYearToken(raw.trim());
}

/** Parse "Apr 2026 – Present" or "Jan 2025 – Dec 2025" into start/end. */
export function parseDateRange(range: string): { start: string | null; end: string | null; isCurrent: boolean } {
  const parts = range.split(/\s{0,40}[–—-]\s{0,40}/);
  if (parts.length < 2) {
    const start = parseMonthYearToken(parts[0] ?? '');
    return { start, end: null, isCurrent: false };
  }
  const start = parseMonthYearToken(parts[0]);
  const endRaw = parts[1].trim();
  const isCurrent = /^present|current|now$/i.test(endRaw);
  const end = isCurrent ? null : parseMonthYearToken(endRaw);
  return { start, end, isCurrent };
}
