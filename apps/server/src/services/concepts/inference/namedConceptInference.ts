import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ConceptCandidate } from './conceptInferenceTypes';
import { buildConceptContext } from './conceptProvenanceService';

export const BARE_GENERIC_CONCEPTS = new Set([
  'idea',
  'concept',
  'thing',
  'thought',
  'stuff',
  'problem',
  'issue',
  'system',
  'logic',
  'rule',
  'framework',
]);

const NAMED_CONCEPTS: Array<{
  pattern: RegExp;
  displayName: string;
  conceptType: ConceptCandidate['conceptType'];
}> = [
  { pattern: /\bLexical Intelligence\b/i, displayName: 'Lexical Intelligence', conceptType: 'technical_concept' },
  { pattern: /\bLoreBook Parser\b/i, displayName: 'LoreBook Parser', conceptType: 'product_concept' },
  { pattern: /\bEntity Gravity\b/i, displayName: 'Entity Gravity', conceptType: 'product_concept' },
  { pattern: /\bIdentity Integrity\b/i, displayName: 'Identity Integrity', conceptType: 'product_concept' },
  { pattern: /\bProvenance\b/i, displayName: 'Provenance', conceptType: 'technical_concept' },
  { pattern: /\bTruth-?State\b/i, displayName: 'Truth-State', conceptType: 'technical_concept' },
  { pattern: /\bPersonal Knowledge Graph\b/i, displayName: 'Personal Knowledge Graph', conceptType: 'technical_concept' },
  { pattern: /\bLife Memory OS\b/i, displayName: 'Life Memory OS', conceptType: 'product_concept' },
  { pattern: /\bnarrative identity\b/i, displayName: 'Narrative Identity', conceptType: 'identity_theme' },
  { pattern: /\bfirst-?gen hustle\b/i, displayName: 'First-Gen Hustle', conceptType: 'identity_theme' },
];

/** Named phrase + generic suffix is valid: "Identity Integrity framework". */
const NAMED_WITH_SUFFIX_RE =
  /\b((?:Identity Integrity|Entity Gravity|Truth-?State|Provenance|Ontology)\s+(?:framework|rule|model|layer))\b/gi;

export function isBareGenericConcept(name: string): boolean {
  return BARE_GENERIC_CONCEPTS.has(normalizeNameKey(name));
}

export function isValidNamedPhrase(displayName: string): boolean {
  if (isBareGenericConcept(displayName)) return false;
  return displayName.trim().split(/\s+/).length >= 2 || NAMED_CONCEPTS.some((n) => n.displayName === displayName);
}

export function inferNamedConcepts(text: string): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, conceptType } of NAMED_CONCEPTS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(makeCandidate(text, displayName, conceptType, text.match(pattern)?.[0] ?? displayName));
  }

  let match: RegExpExecArray | null;
  const suffixRe = new RegExp(NAMED_WITH_SUFFIX_RE.source, 'gi');
  while ((match = suffixRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeCandidate(text, displayName, 'technical_concept', match[0]));
  }

  return out;
}

function makeCandidate(
  text: string,
  displayName: string,
  conceptType: ConceptCandidate['conceptType'],
  evidence: string,
): ConceptCandidate {
  return {
    displayName,
    conceptType,
    context: buildConceptContext(text, displayName),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.9,
    inferredNotConfirmed: true,
    requiresReview: false,
    promotionStatus: 'candidate',
  };
}
