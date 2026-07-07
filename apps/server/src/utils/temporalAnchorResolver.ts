/**
 * Temporal Anchor Resolver
 *
 * Converts natural-language temporal expressions into concrete calendar windows.
 * Handles relative anchors ("the other day"), season anchors ("last summer"),
 * and entity-anchored expressions ("when I was at UCSB", "when Sol and I...").
 *
 * Returns a TemporalWindow: { start, end, precision, label } — or null if no
 * temporal expression is detected.
 *
 * This is a rule-based, zero-API resolver. It runs synchronously and is designed
 * to be called before embedding search so the retriever can bias toward the window.
 */

export interface TemporalWindow {
  start: Date;
  end: Date;
  precision: 'hour' | 'day' | 'week' | 'month' | 'season' | 'year';
  label: string;
  confidence: number; // 0–1: how confident we are in this window
}

// ── Season helpers ────────────────────────────────────────────────────────────

function seasonWindow(year: number, season: 'spring' | 'summer' | 'fall' | 'winter'): [Date, Date] {
  switch (season) {
    case 'spring': return [new Date(year, 2, 1),  new Date(year, 4, 31)];
    case 'summer': return [new Date(year, 5, 1),  new Date(year, 7, 31)];
    case 'fall':   return [new Date(year, 8, 1),  new Date(year, 10, 30)];
    case 'winter': return [new Date(year, 11, 1), new Date(year + 1, 1, 28)];
  }
}

function startOf(unit: 'day' | 'week' | 'month' | 'year', d: Date): Date {
  const r = new Date(d);
  if (unit === 'day')   { r.setHours(0,0,0,0); return r; }
  if (unit === 'week')  { r.setHours(0,0,0,0); r.setDate(d.getDate() - d.getDay()); return r; }
  if (unit === 'month') { r.setDate(1); r.setHours(0,0,0,0); return r; }
  if (unit === 'year')  { r.setMonth(0,1); r.setHours(0,0,0,0); return r; }
  return r;
}

function endOf(unit: 'day' | 'week' | 'month' | 'year', d: Date): Date {
  const r = new Date(d);
  if (unit === 'day')   { r.setHours(23,59,59,999); return r; }
  if (unit === 'week')  { r.setHours(23,59,59,999); r.setDate(d.getDate() - d.getDay() + 6); return r; }
  if (unit === 'month') { r.setMonth(d.getMonth() + 1, 0); r.setHours(23,59,59,999); return r; }
  if (unit === 'year')  { r.setMonth(11, 31); r.setHours(23,59,59,999); return r; }
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
}

function weekendWindow(d: Date): [Date, Date] {
  const weekStart = startOf('week', d);
  const saturday = addDays(weekStart, 6);
  const sunday = addDays(weekStart, 7);
  return [startOf('day', saturday), endOf('day', sunday)];
}

/** Most recent completed calendar season before `now` (e.g. last summer from today). */
export function resolveLastSeasonYear(
  now: Date,
  season: 'spring' | 'summer' | 'fall' | 'winter'
): number {
  const y = now.getFullYear();
  const [, end] = seasonWindow(y, season);
  if (now > end) return y;
  return y - 1;
}

/** Calendar year for "this {season}" relative to `now`. */
export function resolveThisSeasonYear(
  now: Date,
  season: 'spring' | 'summer' | 'fall' | 'winter'
): number {
  const y = now.getFullYear();
  const [start, end] = seasonWindow(y, season);
  if (now >= start && now <= end) return y;
  if (now > end) return y;
  if (season === 'winter' && now.getMonth() <= 1) return y - 1;
  return y;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve a natural-language temporal expression to a calendar window.
 *
 * @param text          User message text to scan
 * @param now           Reference point (usually Date.now())
 * @param entityDates   Optional map of entity name → {first, last} seen dates for
 *                      entity-anchored expressions ("when Sol and I…")
 */
export function resolveTemporalAnchor(
  text: string,
  now: Date = new Date(),
  entityDates?: Map<string, { first: Date; last: Date }>,
): TemporalWindow | null {
  const t = text.toLowerCase();
  const y = now.getFullYear();

  // ── Exact relative ─────────────────────────────────────────────────────────

  if (/\btoday\b/.test(t)) {
    return { start: startOf('day', now), end: endOf('day', now), precision: 'day', label: 'today', confidence: 1.0 };
  }
  if (/\byesterday\b/.test(t)) {
    const d = addDays(now, -1);
    return { start: startOf('day', d), end: endOf('day', d), precision: 'day', label: 'yesterday', confidence: 1.0 };
  }
  if (/\bthis morning\b/.test(t)) {
    const d = startOf('day', now); d.setHours(5);
    return { start: d, end: new Date(now.setHours(12, 0, 0, 0)), precision: 'hour', label: 'this morning', confidence: 0.9 };
  }

  // "the other day" / "the other night" → 2–6 days ago
  if (/\bthe other (day|night|evening)\b/.test(t)) {
    return { start: addDays(now, -6), end: addDays(now, -2), precision: 'day', label: 'the other day', confidence: 0.75 };
  }

  // "recently" / "lately" / "these days" → last 14 days
  if (/\b(recently|lately|these days|not long ago)\b/.test(t)) {
    return { start: addDays(now, -14), end: now, precision: 'week', label: 'recently', confidence: 0.7 };
  }

  // "last night" → yesterday evening
  if (/\blast night\b/.test(t)) {
    const d = addDays(now, -1);
    return { start: new Date(d.setHours(18,0,0,0)), end: new Date(d.setHours(23,59,59,999)), precision: 'hour', label: 'last night', confidence: 0.95 };
  }

  // "this week" / "last week"
  if (/\bthis week\b/.test(t)) {
    return { start: startOf('week', now), end: endOf('week', now), precision: 'week', label: 'this week', confidence: 1.0 };
  }
  if (/\blast week\b/.test(t)) {
    const d = addDays(now, -7);
    return { start: startOf('week', d), end: endOf('week', d), precision: 'week', label: 'last week', confidence: 1.0 };
  }
  if (/\bthis weekend\b/.test(t)) {
    const [start, end] = weekendWindow(now);
    return { start, end, precision: 'week', label: 'this weekend', confidence: 0.95 };
  }
  if (/\blast weekend\b/.test(t)) {
    const [start, end] = weekendWindow(addDays(now, -7));
    return { start, end, precision: 'week', label: 'last weekend', confidence: 0.95 };
  }

  // "this month" / "last month"
  if (/\bthis month\b/.test(t)) {
    return { start: startOf('month', now), end: endOf('month', now), precision: 'month', label: 'this month', confidence: 1.0 };
  }
  if (/\blast month\b/.test(t)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: startOf('month', d), end: endOf('month', d), precision: 'month', label: 'last month', confidence: 1.0 };
  }

  // "this year" / "last year"
  if (/\bthis year\b/.test(t)) {
    return { start: startOf('year', now), end: endOf('year', now), precision: 'year', label: 'this year', confidence: 1.0 };
  }
  if (/\blast year\b/.test(t)) {
    const d = new Date(y - 1, 0, 1);
    return { start: startOf('year', d), end: endOf('year', d), precision: 'year', label: 'last year', confidence: 1.0 };
  }

  // ── N days/weeks/months ago ────────────────────────────────────────────────

  const agoMatch = t.match(/\b(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/);
  if (agoMatch) {
    const n = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2].replace(/s$/, '');
    const multiplier = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30 : 365;
    const center = addDays(now, -(n * multiplier));
    const tolerance = Math.max(1, Math.round(multiplier * 0.15)); // 15% tolerance
    return {
      start: addDays(center, -tolerance),
      end:   addDays(center,  tolerance),
      precision: unit === 'day' ? 'day' : unit === 'week' ? 'week' : unit === 'month' ? 'month' : 'year',
      label: `${n} ${agoMatch[2]} ago`,
      confidence: 0.9,
    };
  }

  const fuzzyAgoMatch = t.match(/\b(?:a\s+)?(?:couple|few)\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/);
  if (fuzzyAgoMatch) {
    const unit = fuzzyAgoMatch[1].replace(/s$/, '');
    const amount = fuzzyAgoMatch[0].includes('couple') ? 2 : 3;
    const multiplier = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30 : 365;
    const center = addDays(now, -(amount * multiplier));
    const tolerance = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 15 : 90;
    return {
      start: addDays(center, -tolerance),
      end: addDays(center, tolerance),
      precision: unit === 'day' ? 'day' : unit === 'week' ? 'week' : unit === 'month' ? 'month' : 'year',
      label: fuzzyAgoMatch[0],
      confidence: 0.72,
    };
  }

  // "past N days/weeks/months" / "last N days"
  const pastMatch = t.match(/\b(?:past|last)\s+(\d+)\s+(day|days|week|weeks|month|months)\b/);
  if (pastMatch) {
    const n = parseInt(pastMatch[1], 10);
    const unit = pastMatch[2].replace(/s$/, '');
    const multiplier = unit === 'day' ? 1 : unit === 'week' ? 7 : 30;
    return {
      start: addDays(now, -(n * multiplier)),
      end:   now,
      precision: unit === 'day' ? 'day' : unit === 'week' ? 'week' : 'month',
      label: `past ${n} ${pastMatch[2]}`,
      confidence: 0.95,
    };
  }

  // ── Season expressions ─────────────────────────────────────────────────────

  const seasonPatterns: Array<[RegExp, 'spring' | 'summer' | 'fall' | 'winter', string]> = [
    [/\blast summer\b/,                    'summer', 'last summer'],
    [/\blast spring\b/,                    'spring', 'last spring'],
    [/\blast fall\b|\blast autumn\b/,      'fall',   'last fall'],
    [/\blast winter\b/,                    'winter', 'last winter'],
    [/\bthis summer\b/,                    'summer', 'this summer'],
    [/\bthis spring\b/,                    'spring', 'this spring'],
    [/\bthis fall\b|\bthis autumn\b/,      'fall',   'this fall'],
    [/\bthis winter\b/,                    'winter', 'this winter'],
    [/\bsummer of (\d{4})\b/,             'summer', ''],
    [/\bspring of (\d{4})\b/,             'spring', ''],
    [/\bfall of (\d{4})\b/,              'fall',   ''],
    [/\bwinter of (\d{4})\b/,            'winter', ''],
  ];

  for (const [re, season, label] of seasonPatterns) {
    if (re.test(t)) {
      const yearMatch = t.match(re)?.[1];
      let targetYear: number;
      if (yearMatch) {
        targetYear = parseInt(yearMatch, 10);
      } else if (label.startsWith('last')) {
        targetYear = resolveLastSeasonYear(now, season);
      } else {
        targetYear = resolveThisSeasonYear(now, season);
      }
      const [start, end] = seasonWindow(targetYear, season);
      const confidence = label.startsWith('last') ? 0.82 : 0.9;
      return { start, end, precision: 'season', label: label || `${season} ${targetYear}`, confidence };
    }
  }

  // ── Named month ───────────────────────────────────────────────────────────

  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const monthDayRe = new RegExp(`\\b(${months.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`);
  const monthDayMatch = t.match(monthDayRe);
  if (monthDayMatch) {
    const shortMap: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
    const monthToken = monthDayMatch[1].replace(/\.$/, '');
    const idx = months.indexOf(monthToken) !== -1 ? months.indexOf(monthToken) : shortMap[monthToken] ?? -1;
    const day = parseInt(monthDayMatch[2], 10);
    if (idx !== -1 && day >= 1 && day <= 31) {
      const explicitYear = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : null;
      const yr = explicitYear ?? (idx > now.getMonth() ? y - 1 : y);
      const d = new Date(yr, idx, day);
      return { start: startOf('day', d), end: endOf('day', d), precision: 'day', label: `${monthToken} ${day}${explicitYear ? ` ${explicitYear}` : ''}`, confidence: explicitYear ? 0.98 : 0.88 };
    }
  }

  const numericDateMatch = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numericDateMatch) {
    const month = parseInt(numericDateMatch[1], 10) - 1;
    const day = parseInt(numericDateMatch[2], 10);
    const yearToken = numericDateMatch[3];
    const yr = yearToken
      ? (yearToken.length === 2 ? 2000 + parseInt(yearToken, 10) : parseInt(yearToken, 10))
      : y;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(yr, month, day);
      return { start: startOf('day', d), end: endOf('day', d), precision: 'day', label: numericDateMatch[0], confidence: yearToken ? 0.96 : 0.82 };
    }
  }

  const monthRe = new RegExp(`\\b(${months.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(?:\\s+(\\d{4}))?\\b`);
  const monthMatch = t.match(monthRe);
  if (monthMatch) {
    const shortMap: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const idx = months.indexOf(monthMatch[1]) !== -1 ? months.indexOf(monthMatch[1]) : shortMap[monthMatch[1]] ?? -1;
    if (idx !== -1) {
      const yr = monthMatch[2] ? parseInt(monthMatch[2], 10) : y;
      const d = new Date(yr, idx, 1);
      return { start: startOf('month', d), end: endOf('month', d), precision: 'month', label: `${monthMatch[1]} ${yr}`, confidence: 0.85 };
    }
  }

  // ── Specific year ─────────────────────────────────────────────────────────

  const yearMatch = t.match(/\bin\s+(20\d{2}|19\d{2})\b|\b(20\d{2}|19\d{2})\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1] || yearMatch[2], 10);
    const d = new Date(yr, 0, 1);
    return { start: startOf('year', d), end: endOf('year', d), precision: 'year', label: `${yr}`, confidence: 0.85 };
  }

  const lifeStageMatch = t.match(/\b(?:when|back when|while)\s+i\s+was\s+(a kid|younger|young|in high school|in college|in university|in grad school|in middle school|in elementary school)\b/);
  if (lifeStageMatch) {
    const stage = lifeStageMatch[1];
    let yearsAgo = 20;
    let label = `when I was ${stage}`;
    if (stage.includes('kid') || stage.includes('elementary')) yearsAgo = 25;
    else if (stage.includes('middle school')) yearsAgo = 20;
    else if (stage.includes('high school')) yearsAgo = 15;
    else if (stage.includes('college') || stage.includes('university')) yearsAgo = 10;
    else if (stage.includes('grad school')) yearsAgo = 5;

    const center = addYears(now, -yearsAgo);
    return {
      start: startOf('year', addYears(center, -1)),
      end: endOf('year', addYears(center, 1)),
      precision: 'year',
      label,
      confidence: 0.58,
    };
  }

  // ── Entity-anchored expressions ────────────────────────────────────────────
  // "when Sol and I…" / "when I was with Renna…" / "when I was at UCSB…"
  // If we have entity timestamp data, use it as the anchor window.

  if (entityDates && entityDates.size > 0) {
    for (const [name, { first, last }] of entityDates) {
      // Check if entity name appears in a temporal context in the message
      const entityRe = new RegExp(`\\b(when|while|during|back when)\\b[^.!?]{0,40}\\b${name.split(' ')[0].toLowerCase()}\\b`, 'i');
      if (entityRe.test(t)) {
        // Expand window by 30 days on each side for context
        return {
          start: addDays(first, -30),
          end:   addDays(last,   30),
          precision: 'month',
          label: `around the time of ${name}`,
          confidence: 0.65,
        };
      }
    }
  }

  return null;
}

/**
 * Extract all temporal expressions from a message and return the tightest window
 * that covers all of them. Returns null if no expressions found.
 */
export function resolveAllTemporalAnchors(
  text: string,
  now: Date = new Date(),
  entityDates?: Map<string, { first: Date; last: Date }>,
): TemporalWindow | null {
  // Try each sentence fragment separately — pick the one with highest confidence
  const sentences = text.split(/[.!?]+/);
  let best: TemporalWindow | null = null;
  for (const sentence of sentences) {
    const w = resolveTemporalAnchor(sentence, now, entityDates);
    if (w && (!best || w.confidence > best.confidence)) best = w;
  }
  return best;
}

/**
 * Format a TemporalWindow as a SQL-friendly date range string pair.
 * Useful for passing directly into Supabase range queries.
 */
export function windowToISORange(w: TemporalWindow): { gte: string; lte: string } {
  return { gte: w.start.toISOString(), lte: w.end.toISOString() };
}
