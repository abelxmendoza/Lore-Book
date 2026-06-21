// =====================================================
// SOCIETY SIGNALS
// Purpose: One canonical place for the lexical signals used to decide what KIND
//          of group a set of people belongs to (family, work, scene, band,
//          institution, ...) and to pull explicit employer/agency/school names
//          out of free text.
//
// Kept pure (no I/O) so it is cheap to run over a whole user's history and easy
// to unit-test. groupDetectionService and the society mapper both import from
// here so the rules never drift apart.
// =====================================================

export type SignalCategory =
  | 'family'
  | 'work'
  | 'scene'
  | 'band'
  | 'institution'
  | 'sports'
  | 'martial_arts'
  | 'club'
  | 'community';

// Ordered by specificity — the society mapper uses the FIRST matching category
// as the dominant type when several are present in the same context.
const CATEGORY_PATTERNS: Array<{ category: SignalCategory; pattern: RegExp }> = [
  {
    // Precise family detection. Bare kinship tokens like "tio"/"tia" are NOT
    // counted on their own because they routinely appear inside names/stage
    // names (e.g. "Goth Tio"). Family only fires on:
    //   1. an unambiguous family word (family/relatives/grandma/...),
    //   2. a possessive + kinship ("my tío", "mi abuela", "our cousin"), or
    //   3. a kinship term at a sentence start ("Tío Juan came over.").
    category: 'family',
    pattern: new RegExp(
      [
        String.raw`\b(?:family|familia|relatives|household|in-?law|grand(?:ma|pa|mother|father)|step(?:mom|dad|mother|father|brother|sister)|abuel[oa]s?)\b`,
        String.raw`\b(?:my|our|mi|mis|nuestr[oa]s?|tu|su)\s+(?:mom|mum|mother|dad|father|sister|brother|cousin|prim[oa]s?|aunt|uncle|abuel[oa]|t[ií][oa]|herman[oa]|nephew|niece|sobrin[oa])\b`,
        String.raw`(?:^|[.!?\n]\s*)(?:t[ií][oa]|mam[aá]|pap[aá]|abuel[oa])\b`,
      ].join('|'),
      'i'
    ),
  },
  {
    category: 'institution',
    pattern: /\b(bootcamp|boot camp|university|college|school|academy|institute|course|class|cohort|curriculum|tuition|semester|graduat|alumni|alumna|alumnus|mentor|taught me|learn(?:ed|ing)?\s+(?:to|how)|enroll)\b/i,
  },
  {
    category: 'work',
    pattern: /\b(work|office|company|colleague|coworker|co-worker|startup|business|job|employer|employee|corp|inc|llc|agency|staffing|recruit(?:er|ing|ed)?|onboarding|hir(?:e|ed|ing)|\bhr\b|i-?9|background check|identity verification|paperwork|payroll|contract(?:or)?|placement|client|shift|manager|boss)\b/i,
  },
  {
    category: 'band',
    pattern: /\b(band|ensemble|duo|trio|quartet|quintet|orchestra|choir|chorus|music|gig|concert|rehearsal|song|album|track|riff|jam|setlist|tour|show)\b/i,
  },
  {
    category: 'martial_arts',
    pattern: /\b(dojo|dojang|sensei|sparring|belt|kata|bjj|mma|martial arts|karate|judo|jiu.?jitsu|taekwondo|muay thai)\b/i,
  },
  {
    category: 'scene',
    pattern: /\b(scene|underground|circuit|nightlife|goth|punk|rave|club night|warehouse|dj|drag|ballroom|subculture|movement)\b/i,
  },
  {
    category: 'sports',
    pattern: /\b(basketball|football|soccer|baseball|tennis|volleyball|hockey|rugby|cricket|team|game|match|tournament|league|practice|coach)\b/i,
  },
  {
    category: 'club',
    pattern: /\b(club|society|association|guild|chapter|fraternity|sorority|meetup|hobby)\b/i,
  },
  {
    category: 'community',
    pattern: /\b(community|collective|congregation|church|temple|mosque|volunteer|charity|neighborhood|group chat|server)\b/i,
  },
];

/** All signal categories present in a piece of text, most-specific first. */
export function extractSignalCategories(text: string): SignalCategory[] {
  const found: SignalCategory[] = [];
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) found.push(category);
  }
  return found;
}

// ── Employer / agency / school proper-noun extraction ────────────────────────
// Captures the name of a workplace, staffing agency, or program from common
// phrasings so it can become a named company/institution group.

const EMPLOYER_NAME_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?(?:staffing\s+|recruiting\s+|temp\s+)?agency\s+(?:called\s+|named\s+)?([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})/g,
  /\b([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})\s{0,40},?\s{1,40}(?:the\s+)?(?:staffing\s+agency|recruiting\s+agency|recruiting\s+firm|staffing\s+firm|the\s+agency)\b/g,
  /\b(?:work(?:s|ed|ing)?\s+(?:for|at)|hired\s+(?:by|through)|recruited\s+by|placed\s+(?:by|through|at)|employed\s+by|through)\s+([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})/g,
  /\b(?:recruiter|onboarding|hr)\s+(?:at|for|with|from)\s+([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})/g,
  // "bootcamp/course called X", "X bootcamp", "graduated from X"
  /\b(?:bootcamp|boot camp|course|program|academy|school)\s+(?:called\s+|named\s+)?([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})/g,
  /\b(?:graduated\s+from|studied\s+at|enrolled\s+(?:at|in)|attended)\s+([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+){0,2})/g,
];

const EMPLOYER_NAME_STOPWORDS = new Set([
  'I', 'The', 'A', 'An', 'My', 'Our', 'Their', 'His', 'Her', 'It', 'This', 'That',
  'Amazon Job', 'Job', 'Today', 'Tomorrow', 'Yesterday', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Me', 'We', 'You', 'They',
]);

export function canonicalEmployerName(raw: string): string | null {
  // Cut at the first sentence punctuation so a greedy capture can't swallow the
  // next word (e.g. "Amazon. Also" → "Amazon").
  let name = raw.split(/[.,;:!?]/)[0].replace(/\s+/g, ' ').trim();
  name = name.replace(/\s{1,40}(?:Job|Today|Tomorrow|Yesterday)$/i, '').trim();
  // Normalize hyphen/space variants of K-force → Kforce.
  if (/^k[\s-]?force$/i.test(name)) return 'Kforce';
  if (name.length < 2) return null;
  return name;
}

/** Pull canonical employer/agency/school names out of a piece of text. */
export function extractEmployerNames(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of EMPLOYER_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = (match[1] ?? '').trim();
      if (!raw) continue;
      const canonical = canonicalEmployerName(raw);
      if (!canonical) continue;
      if (EMPLOYER_NAME_STOPWORDS.has(canonical)) continue;
      found.add(canonical);
    }
  }
  return [...found];
}

// ── Public-entity (famous company / institution) detection ───────────────────
const PUBLIC_ENTITY_SIGNALS = [
  /\b(Apple|Google|Amazon|Microsoft|Meta|Netflix|Tesla|SpaceX|OpenAI|Anthropic|Twitter|X Corp)\b/,
  /\b(Sony|Warner|Universal|EMI|Capitol Records|Atlantic Records|Def Jam)\b/,
  /\bThe (Beatles|Rolling Stones|Who|Clash|Ramones|Pixies|Velvet Underground|Smiths)\b/i,
  /\b(FBI|CIA|NSA|Congress|Senate|Parliament|Supreme Court|NASA|UN|NATO|EU)\b/,
  /\b(Harvard|MIT|Stanford|Oxford|Cambridge|Yale|Princeton|Columbia)\b/,
];

/** True if the name looks like a famous public company/institution. */
export function isPublicEntityName(name: string): boolean {
  return PUBLIC_ENTITY_SIGNALS.some(pattern => pattern.test(name));
}

/** Pull famous public-entity names (e.g. "Amazon") mentioned in the text. */
export function extractPublicEntityNames(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of PUBLIC_ENTITY_SIGNALS) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(global)) {
      const name = (match[1] ?? match[0] ?? '').trim();
      if (name) found.add(name);
    }
  }
  return [...found];
}

/** Hiring language tying an agency to a workplace, e.g. "hired me ... for the X job". */
export const HIRING_PLACEMENT_SIGNAL =
  /\b(hir(?:e|ed|ing)|placed|placement|recruited|onboarding|start(?:ing)?\s+(?:work|the job)|for the\s+\w+\s+(?:job|role|position))\b/i;

/**
 * Narrow staffing/recruiting language. Used to decide WHICH people belong to a
 * staffing agency — far more precise than generic work words ("office", "job"),
 * which would otherwise sweep unrelated people into the agency.
 */
export const STAFFING_SIGNAL =
  /\b(recruit(?:er|ing|ed)?|onboarding|staffing|hir(?:e|ed|ing)|placement|placed|i-?9|background check|identity verification|agency)\b/i;
