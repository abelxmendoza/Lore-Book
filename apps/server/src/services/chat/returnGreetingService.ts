// =====================================================
// RETURN GREETING SERVICE — Phase 7B.4
//
// Generates a specific, grounded greeting when a user returns
// after a gap of 12+ hours. Either returns a greeting string
// containing at least one specific anchor from the last session,
// or returns null (suppressed). There is no generic fallback.
//
// Decision tree:
//   Gate 1 — Minimum signal (messages, gap range)
//   Gate 2 — Crisis guard (last session was acute distress)
//   Gate 3 — Entity / anchor pre-check
//   Gate 4 — Select gap intensity (LIGHT / MEDIUM)
//   Gate 5 — Generate + specificity validation
//
// Phase 7B.4 additions:
//   - Language mirroring instruction in prompt
//   - Relational noun support (dad, mom, abuela, etc.) with context-richness filter
//   - Numeric milestone anchors (30 days sober, 225 bench, etc.) with milestone filter
//
// MVP scope: LIGHT (12–36h) and MEDIUM (36h–7d) only.
// DEEP and REENTRY types are V2.
// =====================================================

import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import { logger } from '../../logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_MESSAGES_TO_GREET    = 5;   // total across all threads
const MIN_GAP_HOURS            = 12;
const MAX_GAP_HOURS            = 168; // 7 days — MVP covers LIGHT + MEDIUM
const ENTITY_MENTION_THRESHOLD = 2;   // proper nouns must appear ≥2× in session
const GREETING_MAX_TOKENS      = 120; // slightly more room for natural phrasing

type GapType = 'LIGHT' | 'MEDIUM';

// ─── Relational noun support ──────────────────────────────────────────────────
// Family titles that are emotionally significant but aren't proper nouns.
// Approved in Phase 7B.3 with context-richness filter.

const RELATIONAL_NOUNS = [
  'dad', 'mom', 'mother', 'father', 'grandma', 'grandpa',
  'abuela', 'abuelo', 'nana', 'papa', 'sis', 'sister',
  'brother', 'bro', 'uncle', 'aunt', 'stepdad', 'stepmom',
  'tio', 'tia', 'lola', 'lolo',
];

// Event verbs that indicate the relational noun is central to the session,
// not just a passing mention. "My dad called" qualifies. "My dad jokes" doesn't.
const EVENT_VERBS = /\b(called|said|told|asked|did|went|got|came|left|died|sick|hurt|moved|broke|fixed|helped|cried|laughed|fought|argued|forgave|apologized|graduated|married|divorced|arrested|passed|diagnosed|surgery|hospital|visiting|visited|texted|messaged|showed up|showed|showed|appeared|missed|missed|called me|told me|asked me)\b/i;

/** Returns relational nouns that appear in event-verb sentences.
 *  This ensures we only reference family members who are central to the session,
 *  not mentioned in passing. */
function extractRelationalNouns(messages: Array<{ content: string }>): string[] {
  const found: string[] = [];
  for (const { content } of messages) {
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const hasRelational = RELATIONAL_NOUNS.find(noun => {
        // Match as a standalone word (not "grandfather" when looking for "grand")
        const re = new RegExp(`\\b${noun}\\b`, 'i');
        return re.test(lower);
      });
      if (hasRelational && EVENT_VERBS.test(sentence)) {
        if (!found.includes(hasRelational)) found.push(hasRelational);
      }
    }
  }
  return found;
}

// ─── Numeric milestone support ────────────────────────────────────────────────
// Numbers adjacent to milestone keywords become memory anchors.
// "30 days sober" qualifies. "I'm 31 years old" doesn't.
// Approved in Phase 7B.3 with milestone keyword filter.

const MILESTONE_KEYWORDS = /\b(first|finally|best|worst|ever|longest|shortest|never|always|milestone|record|sober|clean|streak|goal|target|hit|broke|beat|earned|made|lost|gained|reached|completed|finished|PR|personal record|achievement|score|saved|raised)\b/i;

const NUMBER_PATTERNS = [
  /\$[\d,]+k?/,                    // money: $340, $10k
  /[\d]+(?::\d{2}){1,2}/,          // time: 3:47:22, 2:34
  /[\d]+\.?\d*\s*(?:lbs?|kg|miles?|km)/i,  // weight/distance
  /[\d]+\s*(?:days?|weeks?|months?|years?)\s+(?:sober|clean|streak|saved)/i, // milestone counts
  /\b[\d]{3,}\b/,                  // 3+ digit numbers (scores, savings amounts)
];

/** Extract milestone numbers — numbers that appear in sentences with milestone keywords.
 *  Returns plain-text descriptions like "30 days sober" or "225 lbs". */
function extractMilestoneNumbers(messages: Array<{ content: string }>): string[] {
  const anchors: string[] = [];
  for (const { content } of messages) {
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (!MILESTONE_KEYWORDS.test(sentence)) continue;
      for (const pattern of NUMBER_PATTERNS) {
        const match = sentence.match(pattern);
        if (match) {
          // Preserve the sentence fragment for context rather than the bare number
          const fragment = sentence.trim().slice(0, 60);
          if (!anchors.includes(fragment)) anchors.push(fragment);
          break;
        }
      }
    }
  }
  return anchors.slice(0, 3); // cap at 3 to avoid overwhelming the prompt
}

// ─── Proper noun extraction ───────────────────────────────────────────────────

function selectGapType(gapHours: number): GapType {
  return gapHours < 36 ? 'LIGHT' : 'MEDIUM';
}

const SENTENCE_STARTERS = new Set([
  'The', 'And', 'But', 'For', 'She', 'He', 'They', 'We', 'You', 'It',
  'This', 'That', 'So', 'If', 'Not', 'Just', 'Then', 'Now', 'Oh', 'No',
  'With', 'When', 'Where', 'What', 'Why', 'How', 'All', 'Some', 'My', 'Your',
]);

function extractFrequentEntities(messages: Array<{ content: string }>): string[] {
  const counts = new Map<string, number>();
  const properNounRe = /\b([A-Z][a-z]{2,})\b/g;
  for (const { content } of messages) {
    const matches = content.matchAll(properNounRe);
    for (const [, name] of matches) {
      if (SENTENCE_STARTERS.has(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= ENTITY_MENTION_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);
}

// ─── Specificity guard ────────────────────────────────────────────────────────

/** Returns true if the generated greeting is grounded in an entity, relational noun,
 *  or milestone number from the session — not just a generic observation. */
function passesSpecificityGuard(
  greeting: string,
  properEntities: string[],
  relationalNouns: string[],
  milestoneAnchors: string[],
): boolean {
  const lower = greeting.toLowerCase();

  // Proper noun present in greeting
  if (properEntities.some(e => lower.includes(e.toLowerCase()))) return true;

  // Relational noun present in greeting
  if (relationalNouns.some(n => lower.includes(n.toLowerCase()))) return true;

  // Milestone anchor: check if any number/keyword from the milestone context appears
  for (const anchor of milestoneAnchors) {
    const anchorWords = anchor.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (anchorWords.some(w => lower.includes(w))) return true;
  }

  return false;
}

// ─── Crisis detection ─────────────────────────────────────────────────────────

function detectsCrisis(messages: Array<{ role: string; content: string; metadata?: any }>): boolean {
  const lastMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastMsg) return false;
  const meta = lastMsg.metadata as Record<string, unknown> | undefined;
  if (meta?.mode === 'EMOTIONAL_EXISTENTIAL' && meta?.sentiment === 'DISTRESS') return true;
  const crisisKeywords = /\b(suicid|self.harm|can't go on|don't want to be here|no point|end it all|hurt myself)\b/i;
  return crisisKeywords.test(lastMsg.content);
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildGreetingPrompt(
  gapType: GapType,
  gapDays: number,
  lastMessages: Array<{ role: string; content: string }>,
  properEntities: string[],
  relationalNouns: string[],
  milestoneAnchors: string[],
): string {
  const userMessages = lastMessages.filter(m => m.role === 'user');

  // Pass the actual user messages verbatim so the LLM can mirror their language
  const lastSessionSummary = userMessages
    .slice(-5)
    .map(m => `  - "${m.content.slice(0, 250)}"`)
    .join('\n');

  const entityHint = [
    properEntities.length > 0 ? `Named people/places: ${properEntities.slice(0, 4).join(', ')}` : '',
    relationalNouns.length > 0 ? `Family/relational: ${relationalNouns.join(', ')}` : '',
    milestoneAnchors.length > 0 ? `Milestone details: ${milestoneAnchors.join(' | ')}` : '',
  ].filter(Boolean).join('\n');

  const gapDescription = gapDays < 1
    ? 'about a day'
    : gapDays === 1
    ? '1 day'
    : `${Math.round(gapDays)} days`;

  const intensityInstruction = gapType === 'LIGHT'
    ? 'Gap: less than a day and a half. Tone: picking up mid-conversation — light, casual, no ceremony.'
    : `Gap: ${gapDescription}. Tone: acknowledge the gap briefly ("a few days", "it's been a bit"), then pick up the specific thing.`;

  return `You are writing a return greeting for LoreBook — a personal memory AI.
The user has been away for approximately ${gapDescription}.

${intensityInstruction}

Their exact words from last time:
${lastSessionSummary}

${entityHint ? `Context anchors:\n${entityHint}` : ''}

RULES — read carefully:

1. MIRROR THEIR LANGUAGE. Use the user's exact words when they were vivid or precise.
   - If they said "no double-text", say "no double-text" — not "you chose not to follow up"
   - If they said "I don't know if answering means forgiving", use that phrase
   - If they said "30 days sober", say "30 days sober"
   - Never paraphrase what is already precise. Quote them back to themselves.

2. PICK ONE THING. Not a summary. One specific moment, person, or decision.

3. LENGTH: 1–2 sentences only.

4. CLOSING: Exactly one question or open space. Vary the form:
   - Direct question: "Did you?"
   - Soft reflection: "Still riding that?"
   - Open space: "A lot can happen in ${gapDescription}."
   Never ask "How are you?" — that's generic.

5. DO NOT start with: "I", "Welcome", "Hi", "Hey", the user's name, or "Last time".

6. NEVER invent facts. Reference only what appears in their messages above.

7. If nothing specific can be said, return exactly: SUPPRESS

Return only the greeting or the word SUPPRESS. No quotes, no explanation.`;
}

// ─── Main service ─────────────────────────────────────────────────────────────

export async function generateReturnGreeting(
  userId: string,
  threadId: string,
  gapHours: number
): Promise<string | null> {

  // ── Gate 1: Minimum signal ────────────────────────────────────────────────
  if (gapHours < MIN_GAP_HOURS) {
    logger.debug({ userId, threadId, gapHours, reason: 'gap_too_short' }, 'ReturnGreeting: suppressed');
    return null;
  }
  if (gapHours > MAX_GAP_HOURS) {
    logger.debug({ userId, threadId, gapHours, reason: 'gap_too_long' }, 'ReturnGreeting: suppressed');
    return null;
  }

  const { count: totalCount } = await supabaseAdmin
    .from('conversation_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((totalCount ?? 0) < MIN_MESSAGES_TO_GREET) {
    logger.debug({ userId, threadId, totalCount, reason: 'min_messages' }, 'ReturnGreeting: suppressed');
    return null;
  }

  // ── Fetch last session content ─────────────────────────────────────────────
  const { data: lastMessages, error: msgError } = await supabaseAdmin
    .from('conversation_messages')
    .select('role, content, metadata')
    .eq('session_id', threadId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (msgError || !lastMessages || lastMessages.length === 0) {
    logger.debug({ userId, threadId, reason: 'no_messages' }, 'ReturnGreeting: suppressed');
    return null;
  }

  const chronoMessages = [...lastMessages].reverse();

  // ── Gate 2: Crisis guard ──────────────────────────────────────────────────
  if (detectsCrisis(chronoMessages)) {
    logger.debug({ userId, threadId, reason: 'crisis_guard' }, 'ReturnGreeting: suppressed');
    return null;
  }

  // ── Gate 3: Entity / anchor pre-check ────────────────────────────────────
  const userMessages = chronoMessages.filter(m => m.role === 'user');
  const properEntities  = extractFrequentEntities(userMessages);
  const relationalNouns = extractRelationalNouns(userMessages);
  const milestoneAnchors = extractMilestoneNumbers(userMessages);

  // Must have at least one type of anchor before attempting generation
  if (properEntities.length === 0 && relationalNouns.length === 0 && milestoneAnchors.length === 0) {
    logger.debug({ userId, threadId, reason: 'no_entities' }, 'ReturnGreeting: suppressed');
    return null;
  }

  // ── Gate 4: Select gap type ───────────────────────────────────────────────
  const gapDays = gapHours / 24;
  const gapType = selectGapType(gapHours);

  // ── Gate 5: Generate + validate ───────────────────────────────────────────
  try {
    const prompt = buildGreetingPrompt(
      gapType, gapDays, chronoMessages,
      properEntities, relationalNouns, milestoneAnchors,
    );

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0.6,
      max_tokens:  GREETING_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const candidate = completion.choices[0]?.message?.content?.trim() ?? '';

    if (!candidate || candidate === 'SUPPRESS') {
      logger.debug({ userId, threadId, gapType, reason: 'llm_suppressed' }, 'ReturnGreeting: LLM chose to suppress');
      return null;
    }

    if (!passesSpecificityGuard(candidate, properEntities, relationalNouns, milestoneAnchors)) {
      logger.debug({ userId, threadId, gapType, candidate, reason: 'specificity_failed' }, 'ReturnGreeting: failed specificity guard');
      return null;
    }

    logger.info({
      userId, threadId,
      gapHours: Math.round(gapHours), gapType,
      properEntities: properEntities.length,
      relationalNouns: relationalNouns.length,
      milestoneAnchors: milestoneAnchors.length,
      tokenCount: completion.usage?.total_tokens,
    }, 'ReturnGreeting: generated');

    return candidate;

  } catch (err) {
    logger.error({ err, userId, threadId, reason: 'llm_error' }, 'ReturnGreeting: LLM call failed');
    return null;
  }
}
