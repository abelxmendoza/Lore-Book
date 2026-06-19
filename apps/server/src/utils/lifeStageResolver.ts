/**
 * Life-stage & age temporal resolver.
 *
 * The existing temporalAnchorResolver handles RECENCY-relative time (today, last
 * summer, "3 weeks ago", "summer of 2023"). It does NOT handle the autobiographical
 * phrasing that dominates a life story: age anchors ("when I was 19"), life stages
 * ("in high school", "my sophomore year", "as a kid"), and era anchors ("during the
 * pandemic"). Those are exactly how biographies are organized, so resolving them to
 * absolute calendar windows is the biggest precision win for book/timeline output.
 *
 * Pure & deterministic. Most rules need a `birthYear` anchor (age N → birthYear + N);
 * era anchors like the pandemic resolve WITHOUT a birth year.
 *
 * Windows are approximations: a person is age N across parts of two calendar years,
 * and US school stages map to typical age bands. Confidence is set accordingly so
 * downstream ranking can prefer exact dates over these bands.
 */
import type { TemporalWindow } from './temporalAnchorResolver';

export interface TemporalAnchorProfile {
  /** The user's birth year, if known. Required for age/life-stage resolution. */
  birthYear?: number;
}

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

/** Inclusive calendar-year span → TemporalWindow (precision 'year'). */
function yearSpan(startYear: number, endYear: number, label: string, confidence: number): TemporalWindow {
  return {
    start: new Date(startYear, 0, 1, 0, 0, 0, 0),
    end: new Date(endYear, 11, 31, 23, 59, 59, 999),
    precision: 'year',
    label,
    confidence,
  };
}

// US-typical age bands [minAge, maxAge] for school stages and childhood terms.
const STAGE_AGES: Record<string, [number, number]> = {
  elementary: [5, 10],
  'middle school': [11, 13],
  'junior high': [11, 13],
  'high school': [14, 17],
  college: [18, 21],
  university: [18, 21],
  undergrad: [18, 21],
  'grad school': [22, 25],
  'graduate school': [22, 25],
  toddler: [1, 3],
  kid: [4, 12],
  child: [4, 12],
  childhood: [3, 12],
  teenager: [13, 19],
  teen: [13, 19],
  'growing up': [4, 17],
};

const DECADE_AGES: Record<string, number> = {
  teens: 10, twenties: 20, thirties: 30, forties: 40,
  fifties: 50, sixties: 60, seventies: 70, eighties: 80,
};

const SCHOOL_YEAR_OFFSET: Record<string, number> = {
  freshman: 0, sophomore: 1, junior: 2, senior: 3,
};

/** Era anchors with fixed absolute windows — resolvable with NO birth year. */
function resolveEraAnchor(t: string): TemporalWindow | null {
  if (/\b(the pandemic|covid(?:-19)?|lockdown|quarantine|during covid)\b/.test(t)) {
    // Public phase: WHO pandemic declaration (Mar 2020) through broad reopening (~mid 2021).
    return {
      start: new Date(2020, 2, 1, 0, 0, 0, 0),
      end: new Date(2021, 5, 30, 23, 59, 59, 999),
      precision: 'year',
      label: 'during the pandemic',
      confidence: 0.6,
    };
  }
  return null;
}

/**
 * Resolve an age / life-stage / era expression to a calendar window.
 * Returns null when no such expression is present (or birthYear is required but absent).
 */
export function resolveLifeStageAnchor(
  text: string,
  profile: TemporalAnchorProfile = {},
  _now: Date = new Date(),
): TemporalWindow | null {
  const t = norm(text);
  if (!t) return null;

  // Era anchors first — birth-year independent.
  const era = resolveEraAnchor(t);
  if (era) return era;

  const birthYear = profile.birthYear;
  if (birthYear == null || !Number.isFinite(birthYear)) return null;

  // "when I was 19" / "at age 19" / "at 19 years old" / "when I turned 19" / "aged 19"
  const ageMatch =
    t.match(/\bwhen i (?:was|turned)\s+(\d{1,2})\b/) ??
    t.match(/\bat (?:age\s+)?(\d{1,2})(?:\s+years?\s+old)?\b/) ??
    t.match(/\baged?\s+(\d{1,2})\b/) ??
    t.match(/\b(\d{1,2})\s+years?\s+old\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 0 && age <= 120) {
      const year = birthYear + age;
      // Age N spans parts of two calendar years; bias to the year they turned N.
      return yearSpan(year, year, `at age ${age}`, 0.8);
    }
  }

  // "in my early/mid/late twenties" / "in my teens"
  const decadeMatch = t.match(/\bin my\s+(early|mid|late)?\s*(teens|twenties|thirties|forties|fifties|sixties|seventies|eighties)\b/);
  if (decadeMatch) {
    const phase = decadeMatch[1];
    const base = DECADE_AGES[decadeMatch[2]];
    let lo = base, hi = base + 9;
    if (decadeMatch[2] === 'teens') { lo = 13; hi = 19; }
    if (phase === 'early') hi = lo + 3;
    else if (phase === 'mid') { lo += 3; hi = lo + 2; }
    else if (phase === 'late') lo = hi - 2;
    return yearSpan(birthYear + lo, birthYear + hi, `in my ${phase ? phase + ' ' : ''}${decadeMatch[2]}`, phase ? 0.55 : 0.5);
  }

  // "freshman/sophomore/junior/senior year" — context picks the stage base age.
  const schoolYearMatch = t.match(/\b(freshman|sophomore|junior|senior)\s+year\b/);
  if (schoolYearMatch) {
    const offset = SCHOOL_YEAR_OFFSET[schoolYearMatch[1]];
    const inCollege = /\b(college|university|undergrad)\b/.test(t);
    const inHighSchool = /\bhigh school\b/.test(t);
    const baseAge = inCollege ? 18 : 14; // default to high school when unspecified
    const age = baseAge + offset;
    const confidence = inCollege || inHighSchool ? 0.7 : 0.45;
    const ctx = inCollege ? 'college' : inHighSchool ? 'high school' : 'school';
    return yearSpan(birthYear + age, birthYear + age, `${schoolYearMatch[1]} year of ${ctx}`, confidence);
  }

  // School stages & childhood terms ("in high school", "as a kid", "growing up").
  for (const [stage, [lo, hi]] of Object.entries(STAGE_AGES)) {
    const re = new RegExp(`\\b(?:in|during|as a|back in)?\\s*(?:${stage})\\b`);
    if (re.test(t)) {
      return yearSpan(birthYear + lo, birthYear + hi, stage, 0.6);
    }
  }

  return null;
}

/** Cheap pre-check: does the text contain any life-stage / age / era cue? */
export function hasLifeStageCue(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  if (/\b(the pandemic|covid|lockdown|quarantine)\b/.test(t)) return true;
  if (/\bwhen i (?:was|turned)\s+\d/.test(t)) return true;
  if (/\bat (?:age\s+)?\d{1,2}(?:\s+years?\s+old)?\b/.test(t)) return true;
  if (/\b\d{1,2}\s+years?\s+old\b/.test(t)) return true;
  if (/\b(freshman|sophomore|junior|senior)\s+year\b/.test(t)) return true;
  if (/\bin my\s+(?:early|mid|late)?\s*(?:teens|twenties|thirties|forties|fifties|sixties|seventies|eighties)\b/.test(t)) return true;
  return Object.keys(STAGE_AGES).some((stage) => new RegExp(`\\b${stage}\\b`).test(t));
}

/**
 * Deterministically extract a birth year from explicit self-statements, so the
 * anchor profile can be populated from chat. "born in 1995" is high-confidence;
 * "I'm 28" yields birthYear = currentYear − 28 (±1) at lower confidence.
 */
export function extractBirthYearFromText(
  text: string,
  now: Date = new Date(),
): { birthYear: number; confidence: number; source: string } | null {
  const t = norm(text);
  if (!t) return null;

  const bornMatch = t.match(/\bborn\s+in\s+(\d{4})\b/);
  if (bornMatch) {
    const year = parseInt(bornMatch[1], 10);
    if (year >= 1900 && year <= now.getFullYear()) {
      return { birthYear: year, confidence: 0.95, source: 'born in <year>' };
    }
  }

  // Present-tense self-age: "I'm 28", "I am 28 years old", "I'm 28 years old".
  const ageMatch = t.match(/\bi(?:'m| am)\s+(\d{1,2})(?:\s+years?\s+old)?\b/);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 5 && age <= 120) {
      return { birthYear: now.getFullYear() - age, confidence: 0.6, source: "i'm <age>" };
    }
  }

  return null;
}
