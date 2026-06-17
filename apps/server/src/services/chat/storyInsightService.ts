/**
 * Sprint AK-6 — Biography Writer narrative transforms
 *
 * Reusable fact → insight transforms for archivist/biographer voice.
 */

type InsightRule = {
  pattern: RegExp;
  transform: (match: RegExpMatchArray, raw: string) => string;
};

const INSIGHT_RULES: InsightRule[] = [
  {
    pattern: /\bbootcamp\b.*\b(\d+k|\$\d+|15k|15000)\b/i,
    transform: () => 'The expensive bet that changed me.',
  },
  {
    pattern: /\b(\d+k|\$\d+|15k)\b.*\bbootcamp\b/i,
    transform: () => 'The expensive bet that changed me.',
  },
  {
    pattern: /\b(makes sure|always makes sure|checks that) i eat\b/i,
    transform: (_m, raw) => {
      const nameMatch = raw.match(/\b(T[ií]o|T[ií]a|Abuela|Uncle|Aunt|Grandma|Grandpa)\s+[\w\s.'-]+/i);
      const who = nameMatch?.[0]?.trim() ?? 'Someone close';
      return `One of the quiet caretakers in your life — ${who} makes sure you're fed.`;
    },
  },
  {
    pattern: /\bcostco\b.*\b(abuela|grandma|grandmother)\b|\b(abuela|grandma|grandmother)\b.*\bcostco\b/i,
    transform: () =>
      "The highlight wasn't Costco. It was that Abuela was still there.",
  },
  {
    pattern: /\bthe highlight was\b[^.!?]{10,120}/i,
    transform: (m) => {
      const phrase = m[0].replace(/^the highlight was\s+/i, '').trim();
      return phrase.charAt(0).toUpperCase() + phrase.slice(1) + '.';
    },
  },
  {
    pattern: /\b(still alive|while (she|he|they) (is|are) still)\b/i,
    transform: () => 'Time with them felt precious because it cannot be taken for granted.',
  },
];

export function transformFactToNarrative(fact: string): string | null {
  const raw = fact.trim();
  if (!raw) return null;

  for (const rule of INSIGHT_RULES) {
    const match = raw.match(rule.pattern);
    if (match) return rule.transform(match, raw);
  }

  if (raw.length > 12 && raw.length < 200) {
    return raw.endsWith('.') ? raw : `${raw}.`;
  }

  return null;
}

export function buildStoryInsights(facts: string[]): string[] {
  const insights: string[] = [];
  for (const fact of facts) {
    const narrative = transformFactToNarrative(fact);
    if (narrative && !insights.includes(narrative)) {
      insights.push(narrative);
    }
  }
  return insights.slice(0, 4);
}

export function formatStoryInsightBlock(facts: string[]): string | null {
  const insights = buildStoryInsights(facts);
  if (!insights.length) return null;

  return ['**Story insight:**', ...insights.map((i) => `• ${i}`)].join('\n');
}
