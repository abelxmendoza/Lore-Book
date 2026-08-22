/**
 * Summary discipline — projection-time guards so a fluent recap cannot
 * launder interpretation, causality, or status upgrades into fact.
 *
 * Pure functions. Callers pass generated prose plus the source evidence
 * (user turns / thread text). No schema and no LLM.
 */

export type SummaryDisciplineWarning =
  | 'unsupported_causality'
  | 'unsupported_embellishment'
  | 'interpretation_as_fact'
  | 'fear_as_fact'
  | 'allegation_as_fact'
  | 'low_salience';

export type SummarySentenceDiagnosis = {
  sentence: string;
  warnings: SummaryDisciplineWarning[];
};

export type SummaryDisciplineResult = {
  text: string;
  warnings: Array<{ sentence: string; warning: SummaryDisciplineWarning }>;
};

const EPISTEMIC_WARNINGS: ReadonlySet<SummaryDisciplineWarning> = new Set([
  'interpretation_as_fact',
  'fear_as_fact',
  'allegation_as_fact',
]);

export type SummaryDisciplineRewriteCounts = {
  causalRewriteCount: number;
  embellishmentRewriteCount: number;
  epistemicRewriteCount: number;
};

export function summarizeDisciplineRewrites(
  warnings: SummaryDisciplineResult['warnings'],
): SummaryDisciplineRewriteCounts {
  let causalRewriteCount = 0;
  let embellishmentRewriteCount = 0;
  let epistemicRewriteCount = 0;
  for (const item of warnings) {
    if (item.warning === 'unsupported_causality') causalRewriteCount += 1;
    else if (item.warning === 'unsupported_embellishment') embellishmentRewriteCount += 1;
    else if (EPISTEMIC_WARNINGS.has(item.warning)) epistemicRewriteCount += 1;
  }
  return { causalRewriteCount, embellishmentRewriteCount, epistemicRewriteCount };
}

const SENTENCE_RE = /[^.!?]+[.!?]?/g;

function splitSentences(text: string): string[] {
  const parts = text.match(SENTENCE_RE);
  if (!parts) return text.trim() ? [text.trim()] : [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function joinSentences(sentences: string[]): string {
  return sentences
    .map((s) => s.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

const USER_INTERPRETATION_CUE =
  /\b(?:i think|i thought|i believe|i believed|i suspect|i guessed|maybe (?:she|he|they)|might have been jealous|territorial)\b/i;
const JEALOUSY_OR_MOTIVE =
  /\b(?:jealous(?:y)?|territorial(?:ity)?|feelings of jealousy)\b/i;
const OTHER_INTERNAL_STATE =
  /\b(?:her|his|their)\s+(?:discomfort and )?(?:feelings of )?(?:jealousy|territoriality)\b|\b(?:she|he|they)\s+(?:was|were|is|are)\s+jealous\b/i;

const USER_FEAR_CUE =
  /\b(?:i fear|i'?m (?:worried|afraid|concerned)|i was (?:worried|afraid|concerned)|i worry|i worried)\b/i;
const FEAR_AS_FACT =
  /\breputation (?:spread|has spread|reached)\b/i;

const ALLEGATION_SOURCE =
  /\b(?:people called|they called|someone said|called (?:me|him|her|them))\b/i;

const CAUSAL_CONNECTORS: Array<{
  pattern: RegExp;
  evidence: RegExp;
}> = [
  { pattern: /\bwhich contributed to\b/i, evidence: /\bcontributed to\b/i },
  { pattern: /\bwhich caused\b/i, evidence: /\bcaused\b/i },
  { pattern: /,\s*leading to\b/i, evidence: /\bleading to\b|\bled to\b/i },
  { pattern: /\btherefore\b/i, evidence: /\btherefore\b/i },
  { pattern: /\bas a result of\b/i, evidence: /\bas a result\b/i },
];

const EMBELLISHMENTS: Array<{
  summary: RegExp;
  evidence: RegExp;
  replace: string;
}> = [
  { summary: /\bprominent members?\b/gi, evidence: /\bprominent\b/i, replace: 'member' },
  { summary: /\bimportant coworkers?\b/gi, evidence: /\bimportant coworker\b/i, replace: 'coworker' },
  { summary: /\bclose friends?\b/gi, evidence: /\bclose friend\b/i, replace: 'friend' },
  {
    summary: /\bcommunity leaders?\b/gi,
    evidence: /\bcommunity leader\b|\bleader of (?:the )?community\b/i,
    replace: 'community member',
  },
  {
    summary: /\bactively supporting the community\b/gi,
    evidence: /\bactively supporting\b/i,
    replace: '',
  },
  {
    summary: /\bkeeping in touch off-screen\b/gi,
    evidence: /\boff-screen\b|\bkeeping in touch\b/i,
    replace: '',
  },
];

function sourceHas(source: string, pattern: RegExp): boolean {
  return pattern.test(source);
}

function stripUnsupportedCausality(sentence: string, source: string): {
  sentence: string;
  warned: boolean;
} {
  let out = sentence;
  let warned = false;
  for (const connector of CAUSAL_CONNECTORS) {
    if (connector.pattern.test(out) && !sourceHas(source, connector.evidence)) {
      const idx = out.search(connector.pattern);
      if (idx > 0) {
        out = `${out.slice(0, idx).replace(/[,;:\s]+$/, '')}.`;
      } else {
        out = out.replace(connector.pattern, '').trim();
      }
      warned = true;
    }
  }
  return { sentence: out.replace(/\s{2,}/g, ' ').trim(), warned };
}

function stripEmbellishment(sentence: string, source: string): {
  sentence: string;
  warned: boolean;
} {
  let out = sentence;
  let warned = false;
  for (const rule of EMBELLISHMENTS) {
    if (rule.summary.test(out) && !sourceHas(source, rule.evidence)) {
      out = out.replace(rule.summary, rule.replace).replace(/\s{2,}/g, ' ');
      warned = true;
    }
  }
  // "member of the X scene" without the user saying "member" → knew-through.
  if (
    /\b(?:a |an )?member of the ([a-z0-9][a-z0-9 '-]*?) scene\b/i.test(out) &&
    !/\bmember\b/i.test(source)
  ) {
    out = out.replace(
      /\b(?:a |an )?member of the ([a-z0-9][a-z0-9 '-]*?) scene\b/gi,
      'someone the user knew through the $1 scene',
    );
    warned = true;
  }
  if (/\band a friend\b/i.test(out) && !/\bfriend\b/i.test(source)) {
    out = out.replace(/\s*and a friend\b/gi, '');
    warned = true;
  }
  return { sentence: out.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim(), warned };
}

function rewriteInterpretation(
  sentence: string,
  source: string,
  original: string,
): {
  sentence: string;
  warned: boolean;
} {
  const hadInternalState = OTHER_INTERNAL_STATE.test(original) || OTHER_INTERNAL_STATE.test(sentence);
  if (!hadInternalState) {
    return { sentence, warned: false };
  }
  const userInterpreted = USER_INTERPRETATION_CUE.test(source) || JEALOUSY_OR_MOTIVE.test(source);
  if (userInterpreted) {
    const rewritten = sentence
      .replace(OTHER_INTERNAL_STATE, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/[.\s]+$/, '')
      .trim();
    const attribution =
      'The user believed jealousy or territoriality may also have been involved.';
    return {
      sentence: rewritten ? `${rewritten}. ${attribution}` : attribution,
      warned: true,
    };
  }
  if (!JEALOUSY_OR_MOTIVE.test(source)) {
    return {
      sentence: sentence.replace(OTHER_INTERNAL_STATE, '').replace(/\s{2,}/g, ' ').trim(),
      warned: true,
    };
  }
  return { sentence, warned: false };
}

function rewriteFear(sentence: string, source: string): { sentence: string; warned: boolean } {
  if (!FEAR_AS_FACT.test(sentence) || !USER_FEAR_CUE.test(source)) {
    return { sentence, warned: false };
  }
  const assertedAsFact = /\b(?:reputation (?:did |has )?spread|it spread to)\b/i.test(
    source.replace(USER_FEAR_CUE, ' '),
  );
  if (assertedAsFact) return { sentence, warned: false };
  return {
    sentence: sentence.replace(
      /(?:the user'?s?\s+)?reputation (?:spread|has spread|reached)(?:\s+to [^.]+)?/i,
      'the user was worried that reputation may have spread',
    ),
    warned: true,
  };
}

function rewriteAllegation(sentence: string, source: string): {
  sentence: string;
  warned: boolean;
} {
  const liarFact = sentence.match(/\b(\p{Lu}[\p{L}'-]+)\s+(?:is|was|became)\s+a liar\b/u);
  if (!liarFact) return { sentence, warned: false };
  if (ALLEGATION_SOURCE.test(source)) {
    const name = liarFact[1];
    return {
      sentence: sentence.replace(
        new RegExp(`\\b${name}\\s+(?:is|was|became)\\s+a liar\\b`, 'i'),
        `people called ${name} a liar`,
      ),
      warned: true,
    };
  }
  return { sentence, warned: false };
}

function isLowSalienceContextSentence(sentence: string): boolean {
  const hasCore =
    /\b(?:pushed|boundary|uncomfortable|confront|called (?:me|him|her) out|stopped attending|distanced|relationship|knew through)\b/i.test(
      sentence,
    );
  const decorative =
    /\b(?:dyed|hair|purple|outfit|makeup|alcohol|more drinks|getting more)\b/i.test(sentence);
  return !hasCore && decorative;
}

export function diagnoseSummarySentences(
  summary: string,
  sourceText: string,
): SummarySentenceDiagnosis[] {
  const source = sourceText ?? '';
  return splitSentences(summary).map((sentence) => {
    const warnings: SummaryDisciplineWarning[] = [];
    const causal = stripUnsupportedCausality(sentence, source);
    if (causal.warned) warnings.push('unsupported_causality');
    const embellished = stripEmbellishment(causal.sentence, source);
    if (embellished.warned) warnings.push('unsupported_embellishment');
    const interpreted = rewriteInterpretation(embellished.sentence, source, sentence);
    if (interpreted.warned) warnings.push('interpretation_as_fact');
    const feared = rewriteFear(interpreted.sentence, source);
    if (feared.warned) warnings.push('fear_as_fact');
    const alleged = rewriteAllegation(feared.sentence, source);
    if (alleged.warned) warnings.push('allegation_as_fact');
    if (isLowSalienceContextSentence(alleged.sentence)) warnings.push('low_salience');
    return { sentence, warnings };
  });
}

/**
 * Rewrite a generated summary so unsupported causality, status upgrades,
 * and other-person internal states cannot survive as confident narration.
 */
export function applySummaryDiscipline(
  summary: string | null | undefined,
  sourceText: string,
): SummaryDisciplineResult {
  if (!summary?.trim()) return { text: '', warnings: [] };
  const source = sourceText ?? '';
  const warnings: SummaryDisciplineResult['warnings'] = [];
  const kept: string[] = [];

  for (const original of splitSentences(summary)) {
    let sentence = original;
    const causal = stripUnsupportedCausality(sentence, source);
    sentence = causal.sentence;
    if (causal.warned) warnings.push({ sentence: original, warning: 'unsupported_causality' });

    const embellished = stripEmbellishment(sentence, source);
    sentence = embellished.sentence;
    if (embellished.warned) {
      warnings.push({ sentence: original, warning: 'unsupported_embellishment' });
    }

    const interpreted = rewriteInterpretation(embellished.sentence, source, original);
    sentence = interpreted.sentence;
    if (interpreted.warned) {
      warnings.push({ sentence: original, warning: 'interpretation_as_fact' });
    }

    const feared = rewriteFear(sentence, source);
    sentence = feared.sentence;
    if (feared.warned) warnings.push({ sentence: original, warning: 'fear_as_fact' });

    const alleged = rewriteAllegation(sentence, source);
    sentence = alleged.sentence;
    if (alleged.warned) warnings.push({ sentence: original, warning: 'allegation_as_fact' });

    if (isLowSalienceContextSentence(sentence)) {
      warnings.push({ sentence: original, warning: 'low_salience' });
      continue;
    }

    const cleaned = sentence.replace(/\s{2,}/g, ' ').trim();
    if (cleaned) kept.push(cleaned.endsWith('.') || cleaned.endsWith('!') || cleaned.endsWith('?') ? cleaned : `${cleaned}.`);
  }

  return { text: joinSentences(kept), warnings };
}
