/**
 * Institution vs place-visit role — type is not the same as how a line uses it.
 *
 * USC can be a university (Groups) and a visited campus (Places) without becoming
 * two unrelated records. Third-party education ("Priya graduated from USC")
 * is institution context, not a protagonist visit.
 */

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type InstitutionPlaceRole = 'protagonist_visit' | 'third_party' | 'unspecified';

const FIRST_PERSON_VISIT = new RegExp(
  String.raw`\b(?:i|i'm|i’m|we)\b[^.!?]{0,100}\b(?:went|go|going|visited|stopped(?:\s+by)?|hung\s+out|drove|flew|walked|was|were)\s+(?:to|at|in|near)\s+(?:the\s+)?`,
  'i',
);

const THIRD_PARTY_INSTITUTION = new RegExp(
  String.raw`\b(?:[A-Z][a-zÀ-ÿ'-]+|he|she|they|his|her)\s+(?:went\s+to|graduated\s+from|studied\s+at|got\s+(?:into|accepted\s+to)|attends|attended)\s+(?:the\s+)?`,
  'i',
);

export function classifyInstitutionPlaceRole(name: string, contextText = ''): InstitutionPlaceRole {
  const trimmed = name.trim();
  if (!trimmed || !contextText.trim()) return 'unspecified';
  const escaped = escapeRe(trimmed);
  const visitRe = new RegExp(`${FIRST_PERSON_VISIT.source}${escaped}\\b`, 'i');
  const thirdRe = new RegExp(`${THIRD_PARTY_INSTITUTION.source}${escaped}\\b`, 'i');
  const visit = visitRe.test(contextText);
  const third = thirdRe.test(contextText);
  if (visit && !/\b(?:he|she|they)\s+(?:went|graduated|studied)/i.test(contextText)) {
    return 'protagonist_visit';
  }
  if (third && !visit) return 'third_party';
  if (visit) return 'protagonist_visit';
  return 'unspecified';
}

export function isProtagonistPlaceVisit(name: string, contextText = ''): boolean {
  return classifyInstitutionPlaceRole(name, contextText) === 'protagonist_visit';
}

export function isThirdPartyInstitutionMention(name: string, contextText = ''): boolean {
  return classifyInstitutionPlaceRole(name, contextText) === 'third_party';
}
