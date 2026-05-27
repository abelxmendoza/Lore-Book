export type ContinuityIntent = {
  detected: boolean;
  confidence: number;
  signals: string[];
  entityHints: string[];
  timelineSignificant: boolean;
};

const CONTINUITY_PHRASES = [
  /\b(remember this|save this|store this|log this|capture this|note this|record this)\b/i,
  /\b(remember (how i|what i|that i)|save (how i|what i|that i))\b/i,
  /\b(remember (him|her|them|this person)|store (him|her|them|this person))\b/i,
  /\b(part of (the|my) (journey|story|memoir|timeline|lore|lorekeeper|creation))\b/i,
  /\b(add (this|that|it) to (the|my) (timeline|memoir|lore|lorebook|lorekeeper|creation journey|journey))\b/i,
  /\b(save (this|that|it) (to|in|for) (the|my) (timeline|memoir|lore|lorebook|lorekeeper|creation journey|journey))\b/i,
  /\b(want (this|that|it) (saved|stored|remembered|captured|tracked|recorded))\b/i,
  /\b(want (you|lorekeeper|this) to (remember|save|store|track|capture|record))\b/i,
  /\b(creation journey|lorekeeper journey|writing journey|author journey)\b/i,
  /\b(memoir|autobiography|life story|my story)\b/i,
  /\b(this (matters|is important)|mark (this|it) (as )?(important|significant|notable))\b/i,
  /\b(this (should|needs to) (be )?(saved|stored|remembered|tracked|recorded|logged))\b/i,
  /\b(don['']t (let|want you to) forget (this|that|about|him|her|them))\b/i,
  /\b(keep (this|that|it) (in mind|stored|saved|recorded))\b/i,
  /\b(significant (moment|memory|event|milestone|person))\b/i,
  /\b(milestone|landmark (moment|day|memory))\b/i,
  /\b(always (remember|know|recall) (this|that|about))\b/i,
];

const ENTITY_PERSISTENCE_PHRASES = [
  /\b(remember (her|him|them)|store (her|him|them)|track (her|him|them))\b/i,
  /\b(remember (my|this) (mom|dad|abuela|abuelo|grandma|grandpa|grandmother|grandfather|sister|brother|friend|partner|ex|boss|mentor|teacher))\b/i,
  /\b(remember what (i|we) (said|talked|discussed|felt|shared|went through))\b/i,
  /\b(remember how (i|we) (felt|talked|were|got|ended up))\b/i,
  /\b(remember this person|this person (is|was) important)\b/i,
  /\b(she|he|they) (matters|meant|means) (a lot|so much|everything|the world)\b/i,
  /\b(whenever i (mention|talk about|bring up|say))\b/i,
];

const TIMELINE_SIGNIFICANCE_PHRASES = [
  /\b(timeline|creation journey|lorebook journey|lorekeeper journey)\b/i,
  /\b(memoir|autobiography|creation story|origin story)\b/i,
  /\b(chapter (in|of) (my|the|this))\b/i,
  /\b(part of (the|my) (story|narrative|history|journey))\b/i,
  /\b(the day (i|we)|the moment (i|we)|the time (i|we))\b/i,
  /\b(turning point|defining moment|pivotal|this is where)\b/i,
  /\b(mark(ed)? (in|on|for) (the|my) (timeline|history|journey|story))\b/i,
];

export function detectContinuityIntent(message: string): ContinuityIntent {
  const signals: string[] = [];
  let maxConfidence = 0;

  for (const pattern of CONTINUITY_PHRASES) {
    const match = message.match(pattern);
    if (match) {
      signals.push(match[0].toLowerCase());
      maxConfidence = Math.max(maxConfidence, 0.9);
    }
  }

  for (const pattern of ENTITY_PERSISTENCE_PHRASES) {
    const match = message.match(pattern);
    if (match) {
      signals.push(match[0].toLowerCase());
      maxConfidence = Math.max(maxConfidence, 0.85);
    }
  }

  const timelineSignificant = TIMELINE_SIGNIFICANCE_PHRASES.some(p => p.test(message));
  if (timelineSignificant && signals.length === 0) {
    // Timeline signal alone isn't enough — only boosts if paired with explicit persistence phrase
    maxConfidence = Math.max(maxConfidence, 0.5);
  }

  const entityHints = extractEntityHints(message);

  return {
    detected: maxConfidence >= 0.8,
    confidence: maxConfidence,
    signals,
    entityHints,
    timelineSignificant,
  };
}

function extractEntityHints(message: string): string[] {
  const hints: string[] = [];
  const lower = message.toLowerCase();

  // Family/relationship role mentions
  const rolePatterns = [
    /\b(my )?(abuela|abuelo|grandma|grandpa|grandmother|grandfather|nana|papa|lita|lito)\b/gi,
    /\b(my )?(mom|dad|mother|father|mami|papi|mama|papa)\b/gi,
    /\b(my )?(sister|brother|sibling)\b/gi,
    /\b(my )?(partner|husband|wife|boyfriend|girlfriend|ex)\b/gi,
    /\b(my )?(friend|best friend|bestie)\b/gi,
    /\b(my )?(mentor|teacher|coach|boss)\b/gi,
  ];

  for (const pattern of rolePatterns) {
    const matches = lower.matchAll(pattern);
    for (const match of matches) {
      hints.push(match[0].trim());
    }
  }

  // Proper nouns (simple heuristic: capitalized words not at sentence start)
  const words = message.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z]/g, '');
    if (word.length > 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      // Exclude common sentence-internal capitalizations
      if (!/^(I|The|A|An|This|That|It|He|She|They|We|You|My|Your|His|Her|Their|Our)$/.test(word)) {
        hints.push(word);
      }
    }
  }

  return [...new Set(hints)].slice(0, 5);
}
