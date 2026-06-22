import type { ConceptCandidate } from './conceptInferenceTypes';
import { buildConceptContext } from './conceptProvenanceService';

const BELIEF_CUE_RE =
  /\b(?:I believe|I think|I realized|I feel like|I care about|I don't want|I want LoreBook to)\b[^.!?]*/gi;

const QUOTED_PRINCIPLE_RE =
  /["“]([^"”]{10,120})["”]/g;

const KNOWN_PRINCIPLES: Array<{ pattern: RegExp; displayName: string; conceptType: ConceptCandidate['conceptType'] }> = [
  {
    pattern: /bad memory is worse than no memory/i,
    displayName: 'Bad Memory Is Worse Than No Memory',
    conceptType: 'life_lesson',
  },
];

export function inferBeliefs(text: string): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, conceptType } of KNOWN_PRINCIPLES) {
    if (!pattern.test(text)) continue;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      conceptType,
      context: buildConceptContext(text, displayName, {
        userStance: 'believes',
        sourceDomain: 'narrative',
      }),
      evidencePhrases: [text.match(pattern)?.[0] ?? displayName],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  let match: RegExpExecArray | null;
  const beliefRe = new RegExp(BELIEF_CUE_RE.source, 'gi');
  while ((match = beliefRe.exec(text)) !== null) {
    const phrase = match[0].trim();
    if (phrase.split(/\s+/).length < 5) continue;
    const displayName = extractBeliefTitle(phrase);
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      conceptType: /\bLoreBook\b/i.test(phrase) ? 'goal_concept' : 'belief',
      context: buildConceptContext(text, displayName, {
        userStance: inferStanceFromCue(phrase),
        projectContext: phrase.match(/\bLoreBook\b/i)?.[0],
      }),
      evidencePhrases: [phrase],
      sourceMessageIds: [],
      confidence: 0.82,
      inferredNotConfirmed: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  const quoteRe = new RegExp(QUOTED_PRINCIPLE_RE.source, 'g');
  while ((match = quoteRe.exec(text)) !== null) {
    const quote = match[1].trim();
    if (quote.split(/\s+/).length < 4) continue;
    const displayName = quote.charAt(0).toUpperCase() + quote.slice(1);
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      conceptType: 'philosophy',
      context: buildConceptContext(text, displayName, { userStance: 'believes' }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.85,
      inferredNotConfirmed: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function extractBeliefTitle(phrase: string): string {
  const trimmed = phrase.replace(/^I\s+(?:believe|think|realized|feel like|care about|don't want|want LoreBook to)\s+/i, '');
  return trimmed.slice(0, 80).trim() || 'User Belief';
}

function inferStanceFromCue(phrase: string): ConceptCandidate['context']['userStance'] {
  if (/don't want|fear/i.test(phrase)) return 'fears';
  if (/want LoreBook/i.test(phrase)) return 'wants';
  if (/care about|believe|think|realized/i.test(phrase)) return 'believes';
  return 'explores';
}
