/**
 * Revealed Preference Engine — deterministic taxonomy + pure extraction/scoring.
 *
 * No LLM, no DB. Everything here is a pure function so it is fully unit-testable.
 * The core distinction:
 *   STATED   — the user explicitly says something matters ("I want X", "I value Y")
 *   REVEALED — the user describes DOING something ("I trained", "I took Abuela to Costco")
 *
 * Revealed evidence is the signal that matters: what you repeatedly do, not say.
 */

export type PreferenceType =
  | 'value' | 'goal' | 'fear' | 'motivation' | 'identity'
  | 'habit' | 'preference' | 'interest' | 'skill';

export type SignalType = 'stated' | 'revealed';

export interface RawMatch {
  categoryKey: string;
  type: PreferenceType;
  label: string;
  signalType: SignalType;
  matchedTerm: string;
}

/** A revealed pattern is either a self-contained activity, or a topic term that
 *  only counts as "doing" when a doing-verb co-occurs in the same sentence. */
type RevealedSpec =
  | { kind: 'activity'; pattern: RegExp }     // matching alone = a behavior
  | { kind: 'cooccur'; term: RegExp };        // behavior only if a doing-verb is also present

interface Category {
  key: string;
  label: string;
  type: PreferenceType;
  /** Topic terms — used (with a stated cue) to detect STATED preference. */
  topic: RegExp;
  /** Behavioral signals — used to detect REVEALED preference. */
  revealed: RevealedSpec[];
}

/** Explicit "this matters to me" cues. Case-insensitive, matched per sentence. */
const STATED_CUE =
  /\b(i (want|wanna|value|care about|love|really like|prioriti[sz]e|believe in|am passionate about|aspire to|hope to|wish to|dream of|need)|matters? to me|important to me|my (goal|dream|priority|passion|value)s?\b|i'?m passionate about|i'?m focused on)\b/i;

/** Generic doing-verbs (past/ongoing behavior). Used for `cooccur` revealed specs. */
const DOING_VERB =
  /\b(went|go|going|took|take|taking|drove|visit(ed|ing)?|saw|call(ed|ing)?|text(ed|ing)?|help(ed|ing)?|cook(ed|ing)?|spent|spend(ing)?|hung out|met|meet(ing)?|built|build(ing)?|made|work(ed|ing)?|practic(ed|ing)|train(ed|ing)?|play(ed|ing)?|attend(ed|ing)?|shipped|coded|coding|studied|studying|ran|run(ning)?)\b/i;

/** Build a word-boundary alternation regex from terms. */
const re = (terms: string[], flags = 'i') =>
  new RegExp(`\\b(${terms.join('|')})\\b`, flags);

export const CATEGORIES: Category[] = [
  {
    key: 'lorebook', label: 'LoreBook', type: 'goal',
    topic: /\b(lore\s?book|lore-book)\b/i,
    revealed: [
      { kind: 'activity', pattern: /\b(built|building|build|coded|coding|worked on|working on|shipped|deployed|fixed|debugg(ed|ing)|designed)\b[^.!?]*\blore\s?book\b/i },
      { kind: 'activity', pattern: /\blore\s?book\b[^.!?]*\b(built|building|coded|coding|shipped|deployed|feature|migration|sprint|bug)\b/i },
      { kind: 'activity', pattern: /\bspent\b[^.!?]*\bon\s+lore\s?book\b/i },
    ],
  },
  {
    key: 'robotics', label: 'Robotics', type: 'interest',
    topic: re(['robot', 'robots', 'robotics', 'arduino', 'raspberry pi', 'servo', 'servos', 'microcontroller', 'ros', 'cad', 'soldering', '3d print(ed|ing)?']),
    revealed: [
      { kind: 'activity', pattern: /\b(built|building|soldered|wired|printed|programmed|assembl(ed|ing)|design(ed|ing))\b[^.!?]*\b(robot|arduino|servo|drone|circuit|pcb)\b/i },
      { kind: 'activity', pattern: /\b(muay thai)?\b\bworked on\b[^.!?]*\b(robot|robotics)\b/i },
    ],
  },
  {
    key: 'family', label: 'Family', type: 'value',
    topic: re(['family', 'families', 'abuela', 'abuelo', 'grandma', 'grandmother', 'grandpa', 'grandfather', 'mom', 'mother', 'dad', 'father', 'parents', 't[ií]a', 't[ií]o', 'sister', 'brother', 'cousin', 'aunt', 'uncle', 'niece', 'nephew']),
    revealed: [
      { kind: 'cooccur', term: re(['family', 'abuela', 'abuelo', 'grandma', 'grandmother', 'grandpa', 'mom', 'mother', 'dad', 'father', 'parents', 't[ií]a', 't[ií]o', 'sister', 'brother', 'cousin']) },
    ],
  },
  {
    key: 'fitness', label: 'Fitness', type: 'identity',
    topic: re(['fitness', 'gym', 'workout', 'work out', 'muay thai', 'jiu[- ]?jitsu', 'bjj', 'boxing', 'lifting', 'weights', 'cardio', 'training', 'run', 'running', 'crossfit']),
    revealed: [
      { kind: 'activity', pattern: /\b(muay thai|jiu[- ]?jitsu|bjj|crossfit)\b/i },
      { kind: 'activity', pattern: /\b(went to|hit|at) the gym\b/i },
      { kind: 'activity', pattern: /\b(work(ed)? out|trained|lifted|sparred|benched|squatted|ran \d|went (for )?(a )?run|did cardio)\b/i },
    ],
  },
  {
    key: 'career', label: 'Career', type: 'goal',
    topic: re(['career', 'job', 'work', 'amazon', 'promotion', 'interview', 'salary', 'manager', 'startup', 'company', 'onboarding', 'recruiter']),
    revealed: [
      { kind: 'activity', pattern: /\b(interview(ed|ing)?|applied (for|to)|got (the|a) (job|offer|promotion)|onboard(ed|ing)|landed|hired|fired|laid off|quit my job)\b/i },
      { kind: 'cooccur', term: re(['amazon', 'the office', 'standup', 'sprint', 'deadline', 'client', 'recruiter']) },
    ],
  },
  {
    key: 'nightlife', label: 'Nightlife', type: 'interest',
    topic: re(['nightlife', 'club', 'clubs', 'party', 'parties', 'bar', 'bars', 'rave', 'dj', 'drinks', 'club metro']),
    revealed: [
      { kind: 'activity', pattern: /\b(went (out|to the club|to a (party|bar|rave))|partied|hit the club|at the (club|bar)|out drinking|clubbing|raved)\b/i },
      { kind: 'activity', pattern: /\bclub metro\b/i },
    ],
  },
  {
    key: 'relationships', label: 'Relationships', type: 'value',
    topic: re(['relationship', 'relationships', 'dating', 'girlfriend', 'boyfriend', 'partner', 'date night', 'crush', 'ex']),
    revealed: [
      { kind: 'activity', pattern: /\b(went on a date|date night|took (her|him|them) (out|to)|dinner with (her|him|my (girlfriend|boyfriend|partner|date))|hung out with (her|him|my (girlfriend|boyfriend|partner)))\b/i },
    ],
  },
  {
    key: 'financial_freedom', label: 'Financial Freedom', type: 'goal',
    topic: re(['financial freedom', 'passive income', 'financially free', 'rich', 'wealthy', 'wealth', 'money', 'savings', 'invest(ing|ed|ment)?', 'retire early', 'fire']),
    revealed: [
      { kind: 'activity', pattern: /\b(invested|saved \$?\d|opened (a )?(brokerage|roth|401k)|bought (stock|crypto|shares)|side hustle|freelanc(ed|ing))\b/i },
    ],
  },
  {
    key: 'freedom', label: 'Freedom', type: 'value',
    topic: re(['freedom', 'independence', 'autonomy', 'be my own boss', 'do my own thing', 'flexibility']),
    revealed: [
      { kind: 'activity', pattern: /\b(quit (my )?job to|left to (travel|build)|went (solo|independent|remote)|chose (freedom|flexibility))\b/i },
    ],
  },
  {
    key: 'coding', label: 'Coding & Building', type: 'skill',
    topic: re(['coding', 'code', 'programming', 'software', 'engineer(ing)?', 'app', 'project', 'side project']),
    revealed: [
      { kind: 'activity', pattern: /\b(coded|coding|programmed|built (an?|the) (app|feature|project|tool)|shipped|deployed|wrote code|debugged|pushed (a )?(commit|fix)|skipped .* to code)\b/i },
    ],
  },
  {
    key: 'learning', label: 'Learning', type: 'value',
    topic: re(['learning', 'studying', 'study', 'course', 'book', 'reading', 'class', 'tutorial', 'skill']),
    revealed: [
      { kind: 'activity', pattern: /\b(studied|read (a )?book|took (a )?(course|class)|learned (how to|to)|watched (a )?tutorial|finished (a )?course)\b/i },
    ],
  },
  {
    key: 'friends', label: 'Friends', type: 'value',
    topic: re(['friend', 'friends', 'friendship', 'the boys', 'the crew', 'homies', 'buddies']),
    revealed: [
      { kind: 'cooccur', term: re(['friend', 'friends', 'the boys', 'the crew', 'homies', 'buddies']) },
    ],
  },
];

const SENTENCE_SPLIT = /[.!?\n]+/;

/**
 * Extract preference signals from one episode's text. Pure & deterministic.
 * Per sentence: a stated-cue + topic ⇒ STATED; otherwise a behavioral match ⇒ REVEALED.
 * Returns at most one match per (category, signalType) per call (one episode supports
 * a signal once per type — matching the evidence uniqueness constraint).
 */
export function extractSignals(text: string): RawMatch[] {
  if (!text || text.trim().length === 0) return [];
  const sentences = text.split(SENTENCE_SPLIT);
  const seen = new Set<string>(); // `${categoryKey}:${signalType}`
  const out: RawMatch[] = [];

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;
    const stated = STATED_CUE.test(sentence);
    const hasDoingVerb = DOING_VERB.test(sentence);

    for (const cat of CATEGORIES) {
      const topicMatch = sentence.match(cat.topic);

      // STATED: an explicit value/goal statement that names this topic.
      if (stated && topicMatch) {
        const dedupeKey = `${cat.key}:stated`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          out.push({ categoryKey: cat.key, type: cat.type, label: cat.label, signalType: 'stated', matchedTerm: topicMatch[0] });
        }
        continue; // a stated sentence is not also counted as revealed for this category
      }

      // REVEALED: a described behavior.
      let revealedTerm: string | null = null;
      for (const spec of cat.revealed) {
        if (spec.kind === 'activity') {
          const m = sentence.match(spec.pattern);
          if (m) { revealedTerm = m[0]; break; }
        } else {
          // cooccur: topic term present AND a doing-verb in the same sentence
          const m = sentence.match(spec.term);
          if (m && hasDoingVerb) { revealedTerm = m[0]; break; }
        }
      }
      if (revealedTerm) {
        const dedupeKey = `${cat.key}:revealed`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          out.push({ categoryKey: cat.key, type: cat.type, label: cat.label, signalType: 'revealed', matchedTerm: revealedTerm.trim() });
        }
      }
    }
  }
  return out;
}

/** Confidence saturates with evidence. 0 evidence ⇒ 0 (trust: no evidence, no claim). */
export function confidenceFromEvidence(evidenceCount: number): number {
  if (evidenceCount <= 0) return 0;
  return Number((1 - Math.exp(-evidenceCount / 4)).toFixed(4));
}

export type AlignmentLabel =
  | 'strongly_aligned' | 'aligned' | 'weakly_aligned' | 'revealed_only' | 'stated_only';

const ALIGN_EPS = 0.06; // |share gap| within this ⇒ balanced

/** Classify say-vs-do balance for a category. Pure. */
export function classifyAlignment(input: {
  statedCount: number; revealedCount: number; statedShare: number; revealedShare: number;
}): AlignmentLabel {
  const { statedCount, revealedCount, statedShare, revealedShare } = input;
  if (statedCount === 0 && revealedCount > 0) return 'revealed_only';   // you do it, never say it
  if (revealedCount === 0 && statedCount > 0) return 'stated_only';     // you say it, never do it
  const gap = statedShare - revealedShare; // >0 ⇒ talk more than walk
  if (Math.abs(gap) <= ALIGN_EPS) return 'strongly_aligned';
  if (gap > ALIGN_EPS) return 'weakly_aligned';
  return 'aligned';
}

export type TrendLabel = 'emerging' | 'declining' | 'steady';

/** Recent vs prior revealed rate. `recentDays`/`priorDays` are the window sizes. */
export function classifyTrend(recentRevealed: number, priorRevealed: number, recentDays: number, priorDays: number): { trend: number; label: TrendLabel } {
  const recentRate = recentDays > 0 ? recentRevealed / recentDays : 0;
  const priorRate = priorDays > 0 ? priorRevealed / priorDays : 0;
  const trend = Number((recentRate - priorRate).toFixed(5));
  const THRESH = 0.01; // ~> 0.3 events/month delta
  if (trend > THRESH) return { trend, label: 'emerging' };
  if (trend < -THRESH) return { trend, label: 'declining' };
  return { trend, label: 'steady' };
}
