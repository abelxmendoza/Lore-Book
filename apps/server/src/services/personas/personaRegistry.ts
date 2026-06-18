/**
 * PERSONA REGISTRY
 *
 * Single source of truth for chat personas: display names, internal ids,
 * sensemaking contracts, and evidence policies.
 *
 * These are RESPONSE personas (how LoreBook talks), not LoreAgents (how it
 * observes/ proposes memory changes). Do not conflate the two layers.
 *
 * User-facing names map to existing internal ids wherever possible — we
 * consolidate overlaps instead of spawning parallel implementations.
 */

import type { SensemakingContract } from '../../contracts/sensemakingContract';
import {
  ARCHIVIST_CONTRACT,
  ANALYST_CONTRACT,
  REFLECTOR_CONTRACT,
} from '../../contracts/sensemakingContract';

export type PersonaId =
  | 'therapist'
  | 'strategist'
  | 'gossip_buddy'
  | 'archivist'
  | 'soul_capturer'
  | 'biography_writer';

/** How strictly a persona must ground claims in lore evidence. */
export type PersonaEvidencePolicy = 'must_cite' | 'should_cite' | 'optional';

export interface PersonaDefinition {
  /** Internal id — used by RL, @mentions, systemPromptBuilder. */
  id: PersonaId;
  /** User-facing name shown in UI / marketing. */
  displayName: string;
  /** One-line character. */
  tagline: string;
  /** Which sensemaking contract governs memory access for this voice. */
  contract: SensemakingContract;
  evidencePolicy: PersonaEvidencePolicy;
  /** Alternate @mention slugs and marketing names that resolve to this persona. */
  aliases: string[];
  /** Which LoreAgent outputs this persona should prefer when citing evidence. */
  preferredAgentEvidence: Array<'MemoryAgent' | 'IdentityAgent' | 'ContradictionAgent' | 'NarrativeAgent' | 'SystemAgent'>;
}

/**
 * Canonical registry. Six user-facing personas map to six internal ids with
 * two consolidations called out in comments:
 *
 *   Processing Partner  → therapist
 *   Strategist          → strategist
 *   Gossip Buddy        → gossip_buddy  (Relationship Advisor is an alias with stricter evidence)
 *   Life Historian      → archivist (+ soul_capturer for longitudinal identity patterns)
 *   Biography Writer    → biography_writer
 *   Soul Capturer       → identity longitudinal layer (pairs with archivist for "historian")
 */
export const PERSONA_REGISTRY: Record<PersonaId, PersonaDefinition> = {
  therapist: {
    id: 'therapist',
    displayName: 'Processing Partner',
    tagline: 'Reflective, warm, no judgment. Validates and helps untangle complex emotional situations.',
    contract: REFLECTOR_CONTRACT,
    evidencePolicy: 'optional',
    aliases: ['processing_partner', 'therapist', 'processor'],
    preferredAgentEvidence: ['MemoryAgent', 'SystemAgent'],
  },
  strategist: {
    id: 'strategist',
    displayName: 'Strategist',
    tagline: 'Goal-oriented and actionable. Uses your patterns and history to give guidance grounded in what you have actually lived.',
    contract: ANALYST_CONTRACT,
    evidencePolicy: 'should_cite',
    aliases: ['strategist', 'planner', 'advisor'],
    preferredAgentEvidence: ['MemoryAgent', 'ContradictionAgent', 'NarrativeAgent'],
  },
  gossip_buddy: {
    id: 'gossip_buddy',
    displayName: 'Gossip Buddy',
    tagline: 'Curious and engaged. Asks the right questions about the people in your life.',
    contract: REFLECTOR_CONTRACT,
    evidencePolicy: 'should_cite',
    aliases: ['gossip_buddy', 'gossip', 'relationship_advisor'],
    preferredAgentEvidence: ['IdentityAgent', 'MemoryAgent', 'ContradictionAgent'],
  },
  archivist: {
    id: 'archivist',
    displayName: 'Life Historian',
    tagline: 'Maintains truth and continuity across your narrative. Never forgets. Connects the present to the past.',
    contract: ARCHIVIST_CONTRACT,
    evidencePolicy: 'must_cite',
    aliases: ['archivist', 'life_historian', 'historian', 'recall'],
    preferredAgentEvidence: ['MemoryAgent', 'SystemAgent', 'ContradictionAgent'],
  },
  soul_capturer: {
    id: 'soul_capturer',
    displayName: 'Identity Observer',
    tagline: 'Tracks who you consistently are over time — values, patterns, and recurring themes.',
    contract: REFLECTOR_CONTRACT,
    evidencePolicy: 'must_cite',
    aliases: ['soul_capturer', 'identity', 'patterns'],
    preferredAgentEvidence: ['MemoryAgent', 'NarrativeAgent', 'SystemAgent'],
  },
  biography_writer: {
    id: 'biography_writer',
    displayName: 'Biography Writer',
    tagline: 'Turns your history into readable narrative. Crafts chapters, finds the arc, writes your story beautifully.',
    contract: REFLECTOR_CONTRACT,
    evidencePolicy: 'should_cite',
    aliases: ['biography_writer', 'biographer', 'storyteller'],
    preferredAgentEvidence: ['NarrativeAgent', 'MemoryAgent', 'SystemAgent'],
  },
};

/** All internal persona ids (for RL engine, validation). */
export const ALL_PERSONA_IDS: PersonaId[] = Object.keys(PERSONA_REGISTRY) as PersonaId[];

/** Resolve an @mention slug or display alias to a canonical PersonaId. */
export function resolvePersonaId(slug: string): PersonaId | null {
  const normalized = slug.trim().toLowerCase().replace(/\s+/g, '_');
  for (const def of Object.values(PERSONA_REGISTRY)) {
    if (def.id === normalized || def.aliases.includes(normalized)) {
      return def.id;
    }
  }
  return null;
}

/** Lookup by canonical id. */
export function getPersonaDefinition(id: PersonaId): PersonaDefinition {
  return PERSONA_REGISTRY[id];
}

/** Catalog for API / UI picker — user-facing names with internal ids. */
export function listPersonaCatalog(): Array<{
  id: PersonaId;
  displayName: string;
  tagline: string;
  evidencePolicy: PersonaEvidencePolicy;
  contractId: string;
  mentionAliases: string[];
}> {
  return ALL_PERSONA_IDS.map((id) => {
    const def = PERSONA_REGISTRY[id];
    return {
      id: def.id,
      displayName: def.displayName,
      tagline: def.tagline,
      evidencePolicy: def.evidencePolicy,
      contractId: def.contract.id,
      mentionAliases: def.aliases,
    };
  });
}
