/**
 * Emotional Signal Engine — reads relationship dimensions out of evidence
 * text. Every dimension is detected independently; sexual contact is only
 * ever detected from explicit language, never inferred from interest.
 */
import type {
  BoundaryEvent,
  BoundaryEventKind,
  EmotionalSignal,
  RelationshipDimension,
  SexualEvent,
  SexualEventKind,
} from './relationshipCognitionTypes';

type SignalPattern = {
  dimension: RelationshipDimension;
  polarity: 1 | -1;
  strength: number;
  pattern: RegExp;
};

const SIGNAL_PATTERNS: SignalPattern[] = [
  // Romantic interest
  { dimension: 'romantic_interest', polarity: 1, strength: 0.8, pattern: /\b(crush on|really into|falling for|have feelings for|asked (her|him|them) out|want(ed)? to (date|see) (her|him|them)|butterflies|flirt(ed|ing)?|so cute|smitten)\b/i },
  { dimension: 'romantic_interest', polarity: 1, strength: 0.5, pattern: /\b(interested in (her|him|them)|kinda like (her|him|them)|like (her|him|them) a lot|want to get to know)\b/i },
  { dimension: 'romantic_interest', polarity: -1, strength: 0.8, pattern: /\b(not (really )?interested( in (her|him|them))?|just friends|no spark|don'?t (like|see) (her|him|them) (that|like that)|friend ?zone)\b/i },
  // Sexual attraction — attraction language, NOT contact
  { dimension: 'sexual_attraction', polarity: 1, strength: 0.7, pattern: /\b(so hot|sexy|physically attracted|wanted to kiss|(sexual|physical) tension|turn(s|ed)? me on)\b/i },
  // Emotional attachment
  { dimension: 'emotional_attachment', polarity: 1, strength: 0.8, pattern: /\b(miss(ing|ed)? (her|him|them)|deeply care|attached to|can'?t imagine life without|love (her|him|them)|mean(s)? (so|a lot) to me)\b/i },
  { dimension: 'emotional_attachment', polarity: 1, strength: 0.5, pattern: /\b(care about (her|him|them)|close to (her|him|them)|comfortable around)\b/i },
  { dimension: 'emotional_attachment', polarity: -1, strength: 0.6, pattern: /\b(feel(ing)? nothing (for|toward)|detached from|numb (about|toward))\b/i },
  // Trust
  { dimension: 'trust', polarity: 1, strength: 0.7, pattern: /\b(trust (her|him|them)|confide(d)? in|count on (her|him|them)|always there for me)\b/i },
  { dimension: 'trust', polarity: -1, strength: 0.8, pattern: /\b(lied to me|betrayed|can'?t trust|went behind my back|two[- ]faced)\b/i },
  // Friendship
  { dimension: 'friendship', polarity: 1, strength: 0.6, pattern: /\b(hung out|good friend|great time together|laughed (so much|a lot)|had fun with)\b/i },
  // Conflict
  { dimension: 'conflict', polarity: 1, strength: 0.7, pattern: /\b(argu(ed|ment|ing)|fought|big fight|mad at|pissed (at|off)|yelled at|falling out)\b/i },
  // Avoidance
  { dimension: 'avoidance', polarity: 1, strength: 0.7, pattern: /\b(avoid(ing|ed)? (her|him|them)|ignor(ing|ed) (her|him|them|me)|left (me )?on read|dodg(ed|ing)|keeping my distance)\b/i },
  // Communication
  { dimension: 'communication', polarity: 1, strength: 0.5, pattern: /\b(texted|called|talked (for hours|all night)|been talking|messaged|facetimed?)\b/i },
  // Curiosity
  { dimension: 'curiosity', polarity: 1, strength: 0.5, pattern: /\b(curious about (her|him|them)|wonder (what|how|if) (she|he|they)|want to know more about)\b/i },
  // Hope
  // Evidence is already scoped to one person, so name-form hope ("hope Wren
  // comes") is as safe to match as pronoun-form.
  { dimension: 'hope', polarity: 1, strength: 0.6, pattern: /\b(hope (she|he|they|we)\b|hope \w+ (is|comes|will|shows|makes|joins)|maybe we (could|can|will)|could see us|there('s| is) still a chance|next time (we|i see))\b/i },
  // Grief
  { dimension: 'grief', polarity: 1, strength: 0.8, pattern: /\b(heartbroken|heartbreak|cried (over|about)|grieving|mourning|devastated|hurts to think about)\b/i },
  // Closure — first-person moving on. Highest-signal correction language.
  { dimension: 'closure', polarity: 1, strength: 0.9, pattern: /\b(i('m| am) (finally )?over (her|him|them|it)|i('ve| have) moved on|i('m| am) done with (her|him|them)|at peace with (it|how it ended)|no longer (miss|think about))\b/i },
];

/** Rumination — thinking about someone, not talking to/about them. */
export const RUMINATION_RE =
  /\b(still think(ing)? about|can'?t stop thinking|keeps? coming back to (my mind|me)|crossed my mind|dream(t|ed)? (about|of)|replaying|on my mind|thought about (her|him|them) (today|again|all day))\b/i;

const BOUNDARY_PATTERNS: Array<{ kind: BoundaryEventKind; pattern: RegExp }> = [
  { kind: 'rejection', pattern: /\b(rejected me|turned me down|said no|shot me down|doesn'?t feel the same|didn'?t feel the same)\b/i },
  { kind: 'ghosting', pattern: /\b(ghosted( me)?|stopped (replying|responding|answering)|disappeared on me|never (texted|wrote) back)\b/i },
  { kind: 'blocking', pattern: /\b(blocked( me)?|i blocked (her|him|them)|unfriended|removed me)\b/i },
  { kind: 'boundary_request', pattern: /\b(asked (me )?for space|need(s|ed)? space|asked me to stop|set (a )?boundar(y|ies)|slow(ing)? (things|it) down)\b/i },
  { kind: 'breakup', pattern: /\b(broke up|break ?up|we ended (things|it)|called it (off|quits)|split up|it('s| is) over between us)\b/i },
  { kind: 'argument', pattern: /\b(big (fight|argument)|huge (fight|argument)|blow ?up|screaming match)\b/i },
  { kind: 'reconciliation', pattern: /\b(made up|reconciled|got back together|patched (things|it) up|worked (things|it) out|talking again)\b/i },
];

/** Explicit contact language ONLY. Sex is never inferred without evidence. */
const SEXUAL_PATTERNS: Array<{ kind: SexualEventKind; pattern: RegExp }> = [
  { kind: 'sexual_encounter', pattern: /\b(hooked up|slept (with|together)|had sex|one night stand|spent the night together|went home (with|together))\b/i },
  { kind: 'made_out', pattern: /\b(made out|making out)\b/i },
  { kind: 'kissed', pattern: /\b(kissed|we kissed|first kiss)\b/i },
];

function excerpt(text: string, max = 90): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function extractEmotionalSignals(text: string): EmotionalSignal[] {
  const signals: EmotionalSignal[] = [];
  for (const { dimension, polarity, strength, pattern } of SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ dimension, polarity, strength, excerpt: excerpt(text) });
    }
  }
  // Rumination is attachment-side evidence, tracked as its own signal too.
  if (RUMINATION_RE.test(text)) {
    signals.push({ dimension: 'emotional_attachment', polarity: 1, strength: 0.6, excerpt: excerpt(text) });
  }
  return signals;
}

export function detectBoundaryEvents(text: string, at?: string): BoundaryEvent[] {
  const events: BoundaryEvent[] = [];
  for (const { kind, pattern } of BOUNDARY_PATTERNS) {
    if (pattern.test(text)) events.push({ kind, at, excerpt: excerpt(text) });
  }
  return events;
}

export function detectSexualEvents(text: string, at?: string): SexualEvent[] {
  const events: SexualEvent[] = [];
  for (const { kind, pattern } of SEXUAL_PATTERNS) {
    if (pattern.test(text)) events.push({ kind, at, excerpt: excerpt(text) });
  }
  return events;
}

/** "I'm over X" / "I've moved on" — a correction that overrides inference. */
export function isClosureStatement(text: string): boolean {
  return /\b(i('m| am) (finally )?over (her|him|them)|i('ve| have) moved on( from (her|him|them))?|i('m| am) done with (her|him|them))\b/i.test(text);
}

export function isRumination(text: string): boolean {
  return RUMINATION_RE.test(text);
}
