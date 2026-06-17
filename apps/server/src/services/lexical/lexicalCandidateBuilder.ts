/**
 * Build ontology and memory candidates from lexical signals.
 * Candidates are proposals — cognition/provenance confirms truth writes.
 */
import type {
  LexicalAnalysisResult,
  LexicalEntity,
  MemoryCandidate,
  OntologyCandidate,
} from './lexicalTypes';
import { roleToCanonicalType, roleToScope } from '../ontology/canonical/relationshipKnowledge';

export function buildOntologyCandidates(
  entities: LexicalEntity[],
  skills: LexicalAnalysisResult['skills'],
  relationships: LexicalAnalysisResult['relationships'],
  events: LexicalAnalysisResult['events'],
  glossaryMatches: LexicalAnalysisResult['glossaryMatches'] = []
): OntologyCandidate[] {
  const candidates: OntologyCandidate[] = [];

  for (const org of entities.filter((e) => e.type === 'ORGANIZATION')) {
    candidates.push({
      predicate: 'worked_for',
      object: org.normalized,
      objectType: 'ORGANIZATION',
      confidence: org.confidence,
      source: 'entity:organization',
    });
  }

  for (const skill of skills) {
    const predicate = skill.proficiency_hint === 'improving' || skill.proficiency_hint === 'beginner'
      ? 'is_learning'
      : 'practices';
    candidates.push({
      predicate,
      object: skill.name,
      objectType: 'SKILL',
      confidence: skill.confidence,
      source: 'skill_signal',
    });
  }

  for (const rel of relationships) {
    candidates.push({
      predicate: roleToCanonicalType(rel.role).toLowerCase(),
      object: rel.target ?? rel.role,
      objectType: 'RELATIONSHIP',
      confidence: rel.confidence,
      source: `relationship:${roleToScope(rel.role).toLowerCase()}`,
    });
  }

  for (const evt of events) {
    candidates.push({
      predicate: 'experienced_event',
      object: evt.kind,
      objectType: 'EVENT',
      confidence: evt.confidence,
      source: 'event_signal',
    });
  }

  for (const role of entities.filter((e) => e.type === 'ROLE')) {
    candidates.push({
      predicate: 'has_role',
      object: role.normalized,
      objectType: 'ROLE',
      confidence: role.confidence,
      source: 'entity:role',
    });
  }

  for (const gm of glossaryMatches.filter((g) => g.relationshipHint)) {
    candidates.push({
      predicate: 'relationship_hint',
      object: gm.relationshipHint!,
      objectType: 'RELATIONSHIP',
      confidence: gm.confidence,
      source: `glossary:${gm.alias}`,
    });
  }

  return dedupeCandidates(candidates);
}

export function buildMemoryCandidates(
  skills: LexicalAnalysisResult['skills'],
  emotions: LexicalAnalysisResult['emotions'],
  relationships: LexicalAnalysisResult['relationships'],
  events: LexicalAnalysisResult['events'],
  entities: LexicalEntity[]
): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];

  for (const skill of skills) {
    if (skill.proficiency_hint === 'improving') {
      candidates.push({
        claim: `User is improving at ${skill.name}`,
        category: 'skill',
        confidence: skill.confidence,
        requiresConfirmation: skill.confidence < 0.85,
        source: 'skill:improving',
      });
    }
    if (skill.enjoyment_hint === 'high' || skill.lore_context === 'main thing') {
      candidates.push({
        claim: `${skill.name} is important to the user`,
        category: 'preference',
        confidence: skill.confidence,
        requiresConfirmation: skill.confidence < 0.85,
        source: 'skill:importance',
      });
    }
    if (skill.hobby_or_paid === 'paid' || skill.hobby_or_paid === 'both') {
      candidates.push({
        claim: `User uses ${skill.name} professionally`,
        category: 'skill',
        confidence: skill.confidence * 0.9,
        requiresConfirmation: true,
        source: 'skill:paid',
      });
    }
  }

  for (const rel of relationships) {
    const target = rel.target ? ` (${rel.target})` : '';
    candidates.push({
      claim: `User has a ${rel.sentiment === 'estranged' ? 'estranged ' : ''}${rel.role.replace(/_/g, ' ')} relationship${target}`,
      category: 'relationship',
      confidence: rel.confidence,
      requiresConfirmation: rel.confidence < 0.85,
      source: 'relationship',
    });
  }

  for (const e of emotions.filter((em) => em.intensity !== 'low')) {
    candidates.push({
      claim: `User expressed ${e.label} (${e.valence})`,
      category: 'general',
      confidence: e.confidence * 0.7,
      requiresConfirmation: true,
      source: 'emotion',
    });
  }

  for (const evt of events) {
    candidates.push({
      claim: `User mentioned a ${evt.kind.replace(/_/g, ' ')} event`,
      category: 'event',
      confidence: evt.confidence,
      requiresConfirmation: evt.confidence < 0.8,
      source: 'event',
    });
  }

  for (const id of entities.filter((e) => e.type === 'IDENTITY_CLAIM')) {
    candidates.push({
      claim: `User claims identity as ${id.surface}`,
      category: 'identity',
      confidence: id.confidence,
      requiresConfirmation: true,
      source: 'identity_claim',
    });
  }

  return dedupeMemory(candidates);
}

function dedupeCandidates(candidates: OntologyCandidate[]): OntologyCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const k = `${c.predicate}:${c.object}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeMemory(candidates: MemoryCandidate[]): MemoryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.claim)) return false;
    seen.add(c.claim);
    return true;
  });
}
