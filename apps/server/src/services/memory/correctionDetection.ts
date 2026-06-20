// =====================================================
// CORRECTION DETECTION — Durable Memory Architecture, Slice 4
//
// Pure heuristic that recognizes when a chat message is the user CORRECTING
// something previously said/known ("actually it's…", "no, her name is Maya",
// "that's wrong"). Used at capture time to emit a first-class `correction`
// event alongside the raw message, so the consolidation worker can later turn
// it into a fact lifecycle transition (corrected/outdated -> new active claim).
//
// Conservative by design: better to miss a subtle correction than to mislabel
// ordinary conversation. No I/O — fully unit-testable.
// =====================================================

export interface CorrectionSignal {
  isCorrection: boolean;
  /** 0..1 — how strongly the phrasing signals a correction. */
  confidence: number;
  /** Which pattern fired (for provenance / debugging). */
  matchedPattern?: string;
}

interface Pattern {
  label: string;
  regex: RegExp;
  confidence: number;
}

// Ordered by strength. First/highest match wins.
const PATTERNS: Pattern[] = [
  // Explicit correction markers
  { label: 'correction_prefix', regex: /^\s*correction\s*[:\-]/i, confidence: 0.92 },
  { label: 'let_me_correct', regex: /\b(let me correct|to correct (that|this|myself)|i need to correct)\b/i, confidence: 0.9 },
  { label: 'thats_wrong', regex: /\b(that'?s|that is)\s+(wrong|incorrect|not right|not correct|a mistake)\b/i, confidence: 0.86 },

  // "not X, it's Y" / "not X but Y"
  { label: 'not_x_its_y', regex: /\bnot\s+.+?,?\s+(it'?s|it is|but|rather)\s+/i, confidence: 0.82 },

  // Leading "actually" / "actually it's"
  { label: 'actually_its', regex: /\bactually\b[^.?!]*\b(it'?s|it is|her name|his name|their name|the name|was|is)\b/i, confidence: 0.8 },
  { label: 'actually_lead', regex: /^\s*actually\b/i, confidence: 0.72 },

  // "no, it's…" / "nope, that's…"
  { label: 'no_its', regex: /^\s*(no|nope)\b[,. ]+.*\b(it'?s|it is|that'?s|that is|her|his|their|the)\b/i, confidence: 0.78 },

  // "I meant…" / "what I meant"
  { label: 'i_meant', regex: /\b(i meant|what i meant|i actually meant|i should(?:'ve| have) said|i said .+ but)\b/i, confidence: 0.78 },

  // Correcting a name/value explicitly
  { label: 'name_is_actually', regex: /\b(name|spelling|date|year|title)\s+(is|was)\s+(actually|really)\b/i, confidence: 0.84 },

  // "it should be X (not Y)" / "should actually be"
  { label: 'should_be', regex: /\b(it should (be|say)|should actually be|it'?s supposed to be)\b/i, confidence: 0.74 },

  // Factual retraction of a prior statement
  { label: 'never_happened', regex: /\b(that (never|didn'?t) happen|i (never|didn'?t) (say|mean)|scratch that|disregard that)\b/i, confidence: 0.8 },
];

const MAX_LEN = 600; // ignore very long pasted content for this cheap heuristic

/** Detect whether a message expresses an intent to correct prior information. */
export function detectCorrectionIntent(text: string | null | undefined): CorrectionSignal {
  if (typeof text !== 'string') return { isCorrection: false, confidence: 0 };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return { isCorrection: false, confidence: 0 };

  let best: Pattern | null = null;
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(trimmed)) {
      if (!best || pattern.confidence > best.confidence) best = pattern;
    }
  }

  if (!best) return { isCorrection: false, confidence: 0 };
  return { isCorrection: true, confidence: best.confidence, matchedPattern: best.label };
}
