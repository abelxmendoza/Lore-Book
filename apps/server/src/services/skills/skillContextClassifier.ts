/**
 * Literal / fictional / quoted context classification for skill evidence.
 */

import type { EvidenceRealityContext } from './skillCognitionTypes';

const FICTION_MARKERS =
  /\b(?:team\s+magma|team\s+aqua|maxie|archie|pokemon|pokémon|one\s+piece|luffy|zoro|naruto|anime\s+character|fanfic|role[\s-]?play|rp\b|dungeons?\s*&?\s*dragons?|dnd|critical\s+role|fictional|in[\s-]game|in\s+the\s+story|campaign)\b/i;

const ROLEPLAY_MARKERS =
  /\b(?:as\s+my\s+character|in\s+character|OOC|IC\b|roleplay(?:ing)?|tabletop|TTRPG)\b/i;

const JOKE_MARKERS =
  /\b(?:just\s+kidding|lol\b|lmao|jk\b|for\s+fun|ironically|sarcasm)\b/i;

const HYPOTHETICAL_MARKERS =
  /\b(?:if\s+i\s+(?:were|was|could|would)|hypothetically|in\s+theory|imagine\s+if|what\s+if)\b/i;

const QUOTE_MARKERS =
  /(?:^|\s)["“']|(?:said|told\s+me|according\s+to)\s+[A-Z]/;

/**
 * Classify whether evidence describes real-world user ability.
 */
export function classifyEvidenceRealityContext(
  span: string,
  evidenceText: string,
): { context: EvidenceRealityContext; reasons: string[] } {
  const text = `${evidenceText || ''} ${span || ''}`.trim();
  const reasons: string[] = [];

  if (!text) {
    return { context: 'UNCERTAIN', reasons: ['empty'] };
  }

  if (FICTION_MARKERS.test(text)) {
    reasons.push('fiction_marker');
    return { context: 'FICTION', reasons };
  }
  if (ROLEPLAY_MARKERS.test(text)) {
    reasons.push('roleplay_marker');
    return { context: 'ROLEPLAY', reasons };
  }
  if (JOKE_MARKERS.test(text)) {
    reasons.push('joke_marker');
    return { context: 'JOKE', reasons };
  }
  if (HYPOTHETICAL_MARKERS.test(text)) {
    reasons.push('hypothetical_marker');
    return { context: 'HYPOTHETICAL', reasons };
  }
  if (QUOTE_MARKERS.test(text) && !/\bi\s+(?:said|told)\b/i.test(text)) {
    reasons.push('quoted_or_reported');
    return { context: 'QUOTE', reasons };
  }

  // Third-person education / specialty without first person → other person
  if (
    /\b[A-Z][a-z]+\s+(?:earned|specializes|joined|runs|is\s+a\s+\w+\s+graduate)\b/i.test(text)
    && !/\b(?:i|i'm|my|me)\b/i.test(text)
  ) {
    reasons.push('other_person_narrative');
    return { context: 'OTHER_PERSON', reasons };
  }

  reasons.push('default_real_world');
  return { context: 'REAL_WORLD', reasons };
}

export function realityBlocksSkillCreation(context: EvidenceRealityContext): boolean {
  return context === 'FICTION'
    || context === 'ROLEPLAY'
    || context === 'JOKE'
    || context === 'HYPOTHETICAL'
    || context === 'QUOTE';
}
