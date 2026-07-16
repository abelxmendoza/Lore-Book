/**
 * General-purpose lexical signals for the Story of Self pipeline.
 *
 * These are deliberately generic life-domain vocabularies — no user-specific
 * names, employers, or scenes belong here (see check:founder-privacy).
 */
import type { LifeDomain } from './narrativeRecords';

export const DOMAIN_LEXICON: Record<LifeDomain, RegExp> = {
  education:
    /\b(degree|graduat(e|ed|ion)|university|college|school|semester|thesis|class(es)?|studied|studying|diploma|certificat(e|ion)|bootcamp)\b/i,
  career:
    /\b(job|work(ing|place)?|hired|fired|laid off|boss|manager|coworkers?|colleagues?|promotion|shift|interview|career|lab|department|onboard(ing)?|internship|contract(or)? work|resume|salary|technician|engineer(ing)?)\b/i,
  relationships:
    /\b(girlfriend|boyfriend|partner|dating|date[ds]?|relationship|ex\b|broke up|breakup|crush|married|engaged|romantic)\b/i,
  family:
    /\b(mom|dad|mother|father|brother|sister|uncle|aunt|t[ií][oa]|cousin|grandma|grandpa|abuel[oa]|family|parents|nephew|niece)\b/i,
  health:
    /\b(hospital|injur(y|ed)|sick|surgery|therapy|diagnos(is|ed)|doctor|dentist|health|recover(y|ing)|medication)\b/i,
  location:
    /\b(moved (in|out|to|back)|moving to|new (apartment|place|city)|relocat(e|ed|ing)|lease|roommate)\b/i,
  projects:
    /\b(project|building|built|launch(ed)?|prototype|side.?project|app\b|startup|shipping|shipped|coding|programmed|designed)\b/i,
  community:
    /\b(band|scene|gym|dojo|team|church|club (i|we) (joined|belong)|community|crew|meetup|volunteer(ing)?|league)\b/i,
  finances:
    /\b(rent|debt|paycheck|savings|broke\b|money|afford|loan|bills)\b/i,
  beliefs:
    /\b(realiz(e|ed|ation)|believe[ds]?|faith|philosophy|understood|perspective (shift|change)|worldview)\b/i,
  recreation:
    /\b(party|parties|clubbing|club(s)? (last|to)night|concert|show|festival|bar\b|drinks|rave|karaoke|vape|hangover|night out|nightlife)\b/i,
  identity:
    /\b(who i am|identity|finding myself|the kind of person|define[ds]? me|my story|core (value|part) of)\b/i,
};

/** First-person, durable self-attributes → identity_fact. */
export const IDENTITY_FACT_RE =
  /\b(i (am|have always been|grew up|was raised|hold|earned|studied|trained (in|for) (years|a decade))|my (degree|upbringing|background|hometown|heritage)|i('ve| have) (a|my) (degree|black belt|certification)|for (\d+|many|several) years i)\b/i;

/** Copula/role predicates whose subject is a third party → entity_fact. */
export const ENTITY_FACT_PREDICATE_RE =
  /\b(is|are|was|leads?|manages?|runs?|heads?|works? as|has a (phd|degree|masters?|background))\b/i;

/** Explicit kinship / role bindings → relationship_fact. */
export const RELATIONSHIP_FACT_RE =
  /\b(is my (friend|best friend|girlfriend|boyfriend|partner|boss|manager|mentor|uncle|aunt|t[ií][oa]|cousin|brother|sister|coworker|roommate)|we('ve| have) been (friends|together|dating))\b/i;

/** Past-tense / temporally-grounded action → event. */
export const EVENT_VERB_RE =
  /\b(started|began|went|met|got|joined|left|quit|moved|graduated|finished|launched|won|lost|found|visited|attended|celebrated|performed|traveled|signed|bought|sold|ended|passed|failed|earned|landed|drove|played|worked (on|at)|had (a|an|my))\b/i;

/** Present-progressive self-state → current_state. */
export const CURRENT_STATE_RE =
  /\b(i('m| am) (currently|now|in (week|month)|working on|building|learning|onboarding|training|trying|recovering|looking for)|these days|right now i|lately i('ve| have)?)\b/i;

/** Hedged / unresolved → uncertainty. */
export const UNCERTAINTY_RE =
  /\b(not sure|i wonder|maybe|i don'?t know (if|whether|what)|unclear|can'?t tell|still figuring)\b/i;

/**
 * Durable life-change transitions. A real turning point almost always carries
 * one of these; entity metadata and routine updates never do.
 */
export const TRANSITION_RE =
  /\b(started (a )?(new )?job|first day (at|of work)|got (hired|fired|laid off|promoted|engaged|married|divorced)|quit (my )?job|moved (in|out|to|across)|broke up|breakup|graduated|earned (my|a) (degree|belt|certification)|dropped out|was born|passed away|died|diagnosed|launched|left (the (band|team|company)|home)|joined (the )?(company|team|band|military)|ended (the|our|my)|switched careers?|career change|went back to school)\b/i;

export const ACHIEVEMENT_RE =
  /\b(graduated|earned|promoted|won|achieved|completed|finished (my|the|a)|landed (a|the|my)|passed (the|my)|launched|shipped|black belt|breakthrough|accepted (into|to)|got (hired|the job|accepted))\b/i;

/** Explicit loss / decline / rupture. Required (with negative valence) for a "fall". */
export const LOSS_RE =
  /\b(lost (my|the) (job|home|apartment|scholarship)|got (fired|laid off|kicked out|evicted|dumped)|failed (out|the|my)|broke up|breakup|falling out|passed away|died|relapsed|betrayed|stabbed in the back|hospitalized|arrested|dropped out|gave up on|fell apart|rejected (from|by))\b/i;

export const REALIZATION_RE =
  /\b(realiz(ed|ation)|it (hit|clicked|dawned on) me|eye.?opener|epiphany|i finally understood|changed (how|the way) i (see|think)|never (see|saw) .* the same)\b/i;

export const CONFLICT_RE =
  /\b(argument|fight(ing)? with|conflict|tension|confront(ed|ation)|falling out|drama with|not speaking|beef with|struggl(e|ing) (with|against))\b/i;

export const POSITIVE_VALENCE_RE =
  /\b(welcoming|welcomed|easy to (connect|talk)|great (team|people|time)|proud|excited|grateful|happy|amazing|supportive|belong(ing)?|comfortable|friendly|fun|love[ds]?( it| this)?|thrilled)\b/i;

export const NEGATIVE_VALENCE_RE =
  /\b(devastat(ed|ing)|heartbroken|humiliat(ed|ing)|ashamed|miserable|hopeless|betrayed|furious|terrible|awful|worst|depress(ed|ing)|crushed|defeated|hurt me)\b/i;

/** User told us this matters — emphasis boosts importance. */
export const EMPHASIS_RE =
  /\b(never forget|always remember|this (changed|matters|means)|means (everything|a lot|the world)|most important|defining|core memory|i need to (remember|preserve)|one of the (best|worst|biggest))\b/i;

export const NEGATIVE_MOODS: ReadonlySet<string> = new Set([
  'sad',
  'angry',
  'anxious',
  'fearful',
  'depressed',
  'frustrated',
  'hurt',
  'lonely',
  'ashamed',
]);

export const POSITIVE_MOODS: ReadonlySet<string> = new Set([
  'happy',
  'excited',
  'grateful',
  'proud',
  'hopeful',
  'content',
  'joyful',
  'calm',
]);

export function detectDomains(text: string): LifeDomain[] {
  const domains: LifeDomain[] = [];
  for (const [domain, re] of Object.entries(DOMAIN_LEXICON) as [LifeDomain, RegExp][]) {
    if (re.test(text)) domains.push(domain);
  }
  return domains;
}

/** Positive / negative / neutral valence from text + mood. */
export function estimateValence(text: string, mood?: string | null): number {
  let valence = 0;
  if (POSITIVE_VALENCE_RE.test(text)) valence += 1;
  if (NEGATIVE_VALENCE_RE.test(text)) valence -= 1;
  if (LOSS_RE.test(text)) valence -= 1;
  if (ACHIEVEMENT_RE.test(text)) valence += 1;
  const m = mood?.toLowerCase();
  if (m && POSITIVE_MOODS.has(m)) valence += 1;
  if (m && NEGATIVE_MOODS.has(m)) valence -= 1;
  return Math.max(-1, Math.min(1, valence / 2));
}
