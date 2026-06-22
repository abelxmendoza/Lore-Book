import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ConceptCandidate } from './conceptInferenceTypes';
import { buildConceptContext } from './conceptProvenanceService';

const ARCHITECTURE_CONTEXT =
  /\b(?:architecture|parser|compiler|lexer|semantic layer|knowledge graph|framework|pipeline|LoreBook)\b/i;

export function hasArchitectureContext(text: string): boolean {
  return ARCHITECTURE_CONTEXT.test(text);
}

const TECHNICAL_TERMS: Array<{
  term: RegExp;
  displayName: string;
  requiresArchitecture: boolean;
}> = [
  { term: /\bontology\b/i, displayName: 'Ontology', requiresArchitecture: true },
  { term: /\bprovenance\b/i, displayName: 'Provenance', requiresArchitecture: false },
  { term: /\btruth-?state\b/i, displayName: 'Truth-State', requiresArchitecture: false },
  { term: /\bsemantic layer\b/i, displayName: 'Semantic Layer', requiresArchitecture: true },
  { term: /\bknowledge graph\b/i, displayName: 'Knowledge Graph', requiresArchitecture: true },
  { term: /\bparser\b/i, displayName: 'Parser', requiresArchitecture: true },
  { term: /\bcompiler\b/i, displayName: 'Compiler', requiresArchitecture: true },
  { term: /\blexer\b/i, displayName: 'Lexer', requiresArchitecture: true },
];

export function inferTechnicalConcepts(text: string): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];
  const seen = new Set<string>();
  const hasArch = hasArchitectureContext(text);

  for (const { term, displayName, requiresArchitecture } of TECHNICAL_TERMS) {
    if (!term.test(text)) continue;
    if (requiresArchitecture && !hasArch) continue;

    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      conceptType: 'technical_concept',
      context: buildConceptContext(text, displayName, {
        sourceDomain: 'architecture',
        projectContext: text.match(/\bLoreBook\b/i)?.[0],
      }),
      evidencePhrases: [text.match(term)?.[0] ?? displayName],
      sourceMessageIds: [],
      confidence: requiresArchitecture ? 0.86 : 0.88,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}
