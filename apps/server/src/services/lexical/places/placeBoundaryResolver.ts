/**
 * Trim trailing non-place phrases from over-captured candidate spans.
 */

const TRAILING_TIME =
  /\s+(?:last\s+night|yesterday|today|tonight|this\s+(?:morning|week|month|year)|(?:a\s+)?(?:few|couple)\s+weeks?(?:\s+ago)?|(?:a\s+)?(?:few|couple)\s+days?(?:\s+ago)?|ago)\s*$/i;

const TRAILING_ROLE =
  /\s+a\s+(?:youtuber|streamer|influencer|creator|dj|producer|developer|teacher|professor|coach)\b.*$/i;

const TRAILING_CLAUSE =
  /\s+(?:that|who|which|where|when|weren'?t|wasn't|isn't|aren't|didn't|don't|doesn't|hasn't|haven't)\b.*$/i;

const TRAILING_VERB_FRAGMENT = /\s+weren(?:'t|t)?(?:\s+\w+)?\s*$/i;

const TRAILING_EDUCATION_TAIL = /\s+that\s+taught\b.*$/i;

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

  apply(TRAILING_TIME, 'time_period');
  apply(TRAILING_ROLE, 'role_phrase');
  apply(TRAILING_EDUCATION_TAIL, 'education_clause');
  apply(TRAILING_VERB_FRAGMENT, 'verb_fragment');
  apply(TRAILING_CLAUSE, 'clause_tail');

  return { text, fixes, trimmedSuffix };
}
