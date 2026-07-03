/**
 * Trim trailing non-place phrases from over-captured candidate spans.
 */

const TRAILING_TIME =
  /\s+(?:march|last\s+night|yesterday|today|tonight|this\s+(?:morning|week|month|year)|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+(?:ago|now))?|(?:a\s+)?(?:few|couple)\s+days?(?:\s+ago)?|ago|now)\s*$/i;

const TRAILING_ROLE =
  /\s+a\s+(?:youtuber|streamer|influencer|creator|dj|producer|developer|teacher|professor|coach)\b.*$/i;

const TRAILING_CLAUSE =
  /\s+(?:that|who|which|where|when|weren'?t|wasn't|isn't|aren't|didn't|don't|doesn't|hasn't|haven't)\b.*$/i;

const TRAILING_VERB_FRAGMENT = /\s+weren(?:'t|t)?(?:\s+\w+)?\s*$/i;

const TRAILING_EDUCATION_TAIL = /\s+that\s+taught\b.*$/i;

const TRAILING_SENTENCE_PRONOUN = /[.!?]\s*(?:i|it|he|she|they|we|you|her|him|them)\b.*$/i;

const TRAILING_PRONOUN_CLAUSE =
  /\s+(?:i|it|he|she|they|we|you|her|him|them)\s+(?:still|said|was|were|did|didn'?t|does|don'?t|had|has|went|came|told|asked|wanted|want)\b.*$/i;

const TRAILING_WITH_PERSON = /\s+with\s+(?:my\s+|our\s+|the\s+)?[A-ZÀ-Ý]?[A-Za-zÀ-ÿ]+(?:\s+[A-ZÀ-Ý]?[A-Za-zÀ-ÿ]+){0,2}\s*$/;

const LEADING_RELATIVE_CONTEXT = /^(?:here|there)\s+(?:at|in)\s+/i;

export type BoundaryResolution = {
  text: string;
  fixes: string[];
  trimmedSuffix?: string;
};

export function resolvePlaceBoundary(candidate: string): BoundaryResolution {
  let text = candidate.trim();
  const fixes: string[] = [];
  let trimmedSuffix: string | undefined;

  const apply = (re: RegExp, label: string) => {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index > 0) {
      trimmedSuffix = text.slice(m.index).trim();
      text = text.slice(0, m.index).trim();
      fixes.push(`trim_${label}`);
    }
  };

  const leading = text.match(LEADING_RELATIVE_CONTEXT);
  if (leading) {
    text = text.slice(leading[0].length).trim();
    fixes.push('trim_leading_relative_context');
  }

  if (/[,:;.!?]+$/.test(text)) {
    text = text.replace(/[,:;.!?]+$/g, '').trim();
    fixes.push('trim_terminal_punctuation');
  }

  apply(TRAILING_SENTENCE_PRONOUN, 'sentence_pronoun_bleed');
  apply(TRAILING_PRONOUN_CLAUSE, 'pronoun_clause_bleed');
  apply(TRAILING_TIME, 'time_period');
  apply(TRAILING_WITH_PERSON, 'with_person_tail');
  apply(TRAILING_ROLE, 'role_phrase');
  apply(TRAILING_EDUCATION_TAIL, 'education_clause');
  apply(TRAILING_VERB_FRAGMENT, 'verb_fragment');
  apply(TRAILING_CLAUSE, 'clause_tail');

  return { text, fixes, trimmedSuffix };
}
