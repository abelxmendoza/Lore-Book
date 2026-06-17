/**
 * Build ontology action candidates and memory review candidates from resolved meaning.
 */
import type {
  Factuality,
  IdentityCollision,
  MemoryReviewCandidate,
  OntologyActionCandidate,
  PotentialContradiction,
  ResolvedEntity,
  ResolvedRelationship,
  ResolvedSkill,
  MeaningAmbiguity,
} from './meaningResolutionTypes';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import { allowsHardMemoryCandidate, allowsPreferenceCandidate } from './factualityResolutionService';
import { isFamilyOrRomantic } from './relationshipResolutionService';

export function buildOntologyActionCandidates(
  entities: ResolvedEntity[],
  relationships: ResolvedRelationship[],
  skills: ResolvedSkill[],
  collisions: IdentityCollision[],
  contradictions: PotentialContradiction[],
  lexical: LexicalAnalysisResult,
  text: string,
  factuality: Factuality
): OntologyActionCandidate[] {
  const actions: OntologyActionCandidate[] = [];

  for (const collision of collisions) {
    if (collision.claims.includes('self')) {
      actions.push({
        kind: 'set_legal_name',
        label: `Set "${collision.name}" as your legal name`,
        confidence: collision.confidence,
        requiresConfirmation: true,
        payload: { legalName: collision.name },
      });
    }
    if (collision.claims.includes('relationship') && collision.characterId) {
      actions.push({
        kind: 'distinct_from_self',
        label: collision.relationshipRole
          ? `Keep "${collision.name}" as your ${collision.relationshipRole} (separate person)`
          : `Keep "${collision.name}" as a different person`,
        confidence: collision.confidence,
        requiresConfirmation: true,
        payload: { characterId: collision.characterId, relationship: collision.relationshipRole },
      });
    }
    if (collision.characterId) {
      actions.push({
        kind: 'resolve_duplicate',
        label: `Review "${collision.name}" in Characters`,
        confidence: collision.confidence,
        requiresConfirmation: true,
        payload: { characterId: collision.characterId, surface: 'characters' },
      });
    }
  }

  if (factuality === 'fact') {
    for (const skill of skills) {
      actions.push({
        kind: 'add_skill',
        label: `Add skill: ${skill.name}`,
        confidence: skill.confidence,
        requiresConfirmation: true,
        payload: {
          skillName: skill.name,
          hobbyOrPaid: skill.hobbyOrPaid,
          currentOrFormer: skill.currentOrFormer,
        },
      });
    }
  }

  for (const rel of relationships) {
    actions.push({
      kind: 'set_relationship',
      label: `Set relationship: ${rel.role.replace(/_/g, ' ')}`,
      confidence: rel.confidence,
      requiresConfirmation: true,
      payload: { role: rel.role, targetName: rel.targetName },
    });
  }

  if (lexical.intents.some((i) => i.kind === 'NAVIGATE')) {
    const surface = /\bfamily|father|mother\b/i.test(text) ? 'family' : 'characters';
    actions.push({
      kind: 'navigate_surface',
      label: surface === 'family' ? 'Open Family' : 'Open Characters',
      confidence: 0.75,
      requiresConfirmation: true,
      payload: { surface },
    });
  }

  for (const c of contradictions) {
    actions.push({
      kind: 'confirm_contradiction',
      label: `Confirm change: ${c.existingFact} → ${c.newClaim}`,
      confidence: 0.85,
      requiresConfirmation: true,
      payload: { field: c.field, from: c.existingFact, to: c.newClaim },
    });
  }

  return actions.slice(0, 6);
}

export function buildMemoryReviewCandidates(
  skills: ResolvedSkill[],
  relationships: ResolvedRelationship[],
  entities: ResolvedEntity[],
  factuality: Factuality,
  confidence: number,
  ambiguities: MeaningAmbiguity[]
): MemoryReviewCandidate[] {
  const candidates: MemoryReviewCandidate[] = [];

  if (factuality === 'hypothetical' || factuality === 'question') {
    return candidates;
  }

  for (const skill of skills) {
    if (skill.proficiencyHint === 'improving' && allowsHardMemoryCandidate(factuality, skill.confidence)) {
      candidates.push({
        claim: `User is improving at ${skill.name}`,
        category: 'skill',
        confidence: skill.confidence,
        requiresConfirmation: skill.confidence < 0.85,
        source: 'skill:improving',
      });
    }
    if (skill.enjoymentHint === 'high' || skill.loreContext === 'main thing') {
      candidates.push({
        claim: `${skill.name} is important to the user`,
        category: 'preference',
        confidence: skill.confidence,
        requiresConfirmation: true,
        source: 'skill:importance',
      });
    }
    if (skill.hobbyOrPaid === 'paid' && skill.currentOrFormer === 'current') {
      candidates.push({
        claim: `User uses ${skill.name} professionally`,
        category: 'skill',
        confidence: skill.confidence * 0.9,
        requiresConfirmation: true,
        source: 'skill:paid',
      });
    }
    if (skill.currentOrFormer === 'former' && skill.hobbyOrPaid === 'paid') {
      candidates.push({
        claim: `User formerly used ${skill.name} professionally`,
        category: 'skill',
        confidence: skill.confidence * 0.85,
        requiresConfirmation: true,
        source: 'skill:former_paid',
      });
    }
  }

  for (const rel of relationships) {
    const label = rel.role.replace(/_/g, ' ');
    candidates.push({
      claim: `User has a ${rel.sentiment === 'estranged' ? 'estranged ' : ''}${label} relationship`,
      category: 'relationship',
      confidence: rel.confidence,
      requiresConfirmation: isFamilyOrRomantic(rel.role) || rel.requiresConfirmation,
      source: 'relationship',
    });
  }

  for (const e of entities.filter((ent) => ent.isSelf)) {
    candidates.push({
      claim: `User claims identity as ${e.surface}`,
      category: 'identity',
      confidence: e.confidence,
      requiresConfirmation: true,
      source: 'identity_claim',
    });
  }

  if (allowsPreferenceCandidate(factuality)) {
    for (const a of ambiguities.filter((x) => x.code.includes('desire') || x.code.includes('uncertain'))) {
      candidates.push({
        claim: a.description,
        category: 'goal',
        confidence: confidence * 0.6,
        requiresConfirmation: true,
        source: 'preference',
      });
    }
  }

  if (confidence < 0.5) {
    for (const e of entities) {
      candidates.push({
        claim: `Possible entity: ${e.surface} (${e.kind})`,
        category: 'general',
        confidence: e.confidence,
        requiresConfirmation: true,
        source: 'low_confidence',
      });
    }
  }

  return dedupe(candidates);
}

function dedupe(items: MemoryReviewCandidate[]): MemoryReviewCandidate[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    if (seen.has(c.claim)) return false;
    seen.add(c.claim);
    return true;
  });
}
