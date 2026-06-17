/**
 * Lightweight, pre-LLM signal gates for the per-message extractor cluster.
 *
 * The ingestion pipeline used to fire ~6 independent LLM extractions on EVERY
 * user message — quest, quest-progress, skill, project, interest, life-change —
 * regardless of whether the message contained any such content. A typical line
 * like "had coffee with Maria" triggered all six, almost all returning empty.
 * That fan-out was the dominant driver of the OpenAI 429 storm (and its cost).
 *
 * These cheap keyword gates mirror the existing `hasRomanticSignals` pattern:
 * run the (fire-and-forget) extractor only when the text plausibly contains the
 * relevant signal. Because the callers are non-blocking background work, a gate
 * that is slightly too tight only risks a missed suggestion — never the user's
 * chat response — and is recoverable on a later message or nightly sweep.
 *
 * Gates intentionally err toward recall: broad enough to catch real intent,
 * tight enough to skip greetings, questions, and plain third-person narration.
 */

const norm = (s: string) => (s ?? '').toLowerCase().replace(/[‘’ʼ]/g, "'");

const QUEST_RE =
  /\b(want to|wanna|plan to|planning to|going to|gonna|hope to|hoping to|aim to|aiming to|trying to|try to|need to|have to|gotta|goal|goals|dream of|aspire|intend to|decided to|i will|i'll|resolution|bucket list|some ?day i)\b/i;

const PROGRESS_RE =
  /\b(finished|completed|done with|wrapped up|knocked out|made progress|making progress|almost done|halfway|half way|milestone|got through|on track|\d{1,3}\s?%)\b/i;

const SKILL_RE =
  /\b(learning|learned|practicing|practiced|getting better|getting good|improving|improved|studying|studied|training|trained|mastered|master|leveled up|level(?:ing)? up|skill|skills|technique|picked up|teaching myself|self ?taught)\b/i;

const PROJECT_RE =
  /\b(project|building|built|i'm building|working on|launch|launching|launched|shipped|shipping|side project|startup|prototype|mvp|deployed|deploying|released|releasing|in the works)\b/i;

const INTEREST_RE =
  /\b(?:love|loving|(?:i'?m|really|getting|so|totally|super|pretty|way)\s+into|interested in|passion|passionate|obsessed|obsessing|hobby|hobbies|favorite|favourite|enjoy|enjoying|fan of|really like|fascinated|hooked on|can'?t stop)\b/i;

const LIFE_CHANGE_RE =
  /\b(quit|quitting|moved|moving|broke up|break ?up|new job|got a job|got married|getting married|married|divorced|divorce|engaged|stopped|no longer|gave up|giving up|switching|switched|left my|dropped out|drop out|retired|laid off|got fired|fired|pregnant|had a baby|new place|relocat)\b/i;

export const hasQuestSignal = (text: string): boolean => QUEST_RE.test(norm(text));
export const hasProgressSignal = (text: string): boolean => PROGRESS_RE.test(norm(text));
export const hasSkillSignal = (text: string): boolean => SKILL_RE.test(norm(text));
export const hasProjectSignal = (text: string): boolean => PROJECT_RE.test(norm(text));
export const hasInterestSignal = (text: string): boolean => INTEREST_RE.test(norm(text));
export const hasLifeChangeSignal = (text: string): boolean => LIFE_CHANGE_RE.test(norm(text));

/** Fast top-level check: does the message warrant ANY of the cluster extractors? */
export const hasAnyExtractionSignal = (text: string): boolean => {
  const t = norm(text);
  return (
    QUEST_RE.test(t) ||
    PROGRESS_RE.test(t) ||
    SKILL_RE.test(t) ||
    PROJECT_RE.test(t) ||
    INTEREST_RE.test(t) ||
    LIFE_CHANGE_RE.test(t)
  );
};
