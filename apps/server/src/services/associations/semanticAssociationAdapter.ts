/**
 * Semantic → Association Adapter.
 *
 * The Association Graph should not re-parse raw text when a structured
 * SemanticAnalysis is already available. The LoreBook semantic analyzer
 * (src/services/lorebook/semantic) emits `SemanticEdge`s — subject → relation →
 * object with BOTH endpoints already resolved to canonical identity — plus
 * `SemanticEntity`s carrying `matchedId`. This adapter:
 *
 *   1. Maps each SemanticEdge.relationType → an AssociationType, preserving the
 *      canonical entityIds so associations attach to real identities, not
 *      provisional name-slugs.
 *   2. Exposes a resolver so the regex fallback rules can upgrade the entities
 *      they detect (a name string) to canonical ids/kinds using the analyzer's
 *      resolution table.
 *
 * Core principle is preserved: an unknown relationType maps to the DEFAULT tie
 * (`associated_with`), never to membership. Only an explicit membership/
 * ownership relationType with both endpoints resolved yields `member_of`/`owns`.
 */
import type { SemanticAnalysis, SemanticEdge } from '../lorebook/semantic/semanticAnalysisTypes';
import type { EntityRef as ParserEntityRef, LoreBookDomain } from '../lorebook/parser/loreBookParserTypes';
import { associationEvidenceService } from './associationEvidenceService';
import {
  BASE_CONFIDENCE,
  SELF_SUBJECT,
  entityRef,
  type AssociationObservation,
  type AssociationTargetKind,
  type AssociationType,
  type EntityRef,
} from './associationTypes';

interface RelationMapping {
  type: AssociationType;
  /** Explicit membership/ownership relations (require both endpoints resolved). */
  explicit?: boolean;
}

/**
 * relationType (free lowercase string from the parser) → AssociationType.
 * Kept intentionally small + explicit; anything unmapped becomes the default
 * `associated_with` tie, honoring "association is the default".
 */
const RELATION_TYPE_MAP: Record<string, RelationMapping> = {
  // kinship / family → related_to
  family: { type: 'related_to' },
  relative: { type: 'related_to' },
  cousin: { type: 'related_to' },
  uncle: { type: 'related_to' },
  aunt: { type: 'related_to' },
  sibling: { type: 'related_to' },
  brother: { type: 'related_to' },
  sister: { type: 'related_to' },
  parent: { type: 'related_to' },
  mother: { type: 'related_to' },
  father: { type: 'related_to' },
  grandparent: { type: 'related_to' },
  grandmother: { type: 'related_to' },
  grandfather: { type: 'related_to' },
  child: { type: 'related_to' },
  son: { type: 'related_to' },
  daughter: { type: 'related_to' },
  nephew: { type: 'related_to' },
  niece: { type: 'related_to' },
  spouse: { type: 'related_to' },
  partner: { type: 'related_to' },
  husband: { type: 'related_to' },
  wife: { type: 'related_to' },
  boyfriend: { type: 'related_to' },
  girlfriend: { type: 'related_to' },

  // social ties → associated_with (the default), NOT membership
  best_friend: { type: 'associated_with' },
  close_friend: { type: 'associated_with' },
  friend: { type: 'associated_with' },
  acquaintance: { type: 'associated_with' },

  // household
  roommate: { type: 'lived_with' },
  housemate: { type: 'lived_with' },
  lives_with: { type: 'lived_with' },
  lived_with: { type: 'lived_with' },

  // work / school colleagues (NOT membership)
  colleague: { type: 'worked_with' },
  coworker: { type: 'worked_with' },
  worked_with: { type: 'worked_with' },
  classmate: { type: 'studied_with' },
  schoolmate: { type: 'studied_with' },
  studied_with: { type: 'studied_with' },
  bandmate: { type: 'performed_with' },
  performed_with: { type: 'performed_with' },

  // presence
  attended: { type: 'attended' },
  visited: { type: 'visited' },
  participated_in: { type: 'participated_in' },
  affiliated_with: { type: 'affiliated_with' },
  associated_with: { type: 'associated_with' },

  // EXPLICIT membership / ownership (only these can reach member_of/owns)
  employer: { type: 'member_of', explicit: true },
  employee_of: { type: 'member_of', explicit: true },
  employed_by: { type: 'member_of', explicit: true },
  works_at: { type: 'member_of', explicit: true },
  member: { type: 'member_of', explicit: true },
  member_of: { type: 'member_of', explicit: true },
  owner: { type: 'owns', explicit: true },
  owns: { type: 'owns', explicit: true },
  founder: { type: 'organizes', explicit: true },
  organizer: { type: 'organizes', explicit: true },
  organizes: { type: 'organizes', explicit: true },
  leads: { type: 'organizes', explicit: true },
};

const DOMAIN_KIND: Record<LoreBookDomain, AssociationTargetKind> = {
  characters: 'person',
  family: 'person',
  relationships: 'person',
  locations: 'place',
  organizations: 'organization',
  work: 'organization',
  groups: 'group',
  schools: 'school',
  events: 'event',
  timeline: 'event',
  skills: 'unknown',
  projects: 'unknown',
  quests: 'unknown',
};

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ');

function domainToKind(domain?: LoreBookDomain): AssociationTargetKind {
  return domain ? DOMAIN_KIND[domain] ?? 'unknown' : 'unknown';
}

/** Map a relationType, defaulting unknown relations to the weak default tie. */
export function mapRelationType(relationType: string): RelationMapping {
  return RELATION_TYPE_MAP[norm(relationType).replace(/\s+/g, '_')] ?? { type: 'associated_with' };
}

/** Build an EntityRef from a parser EntityRef, preferring canonical id. */
function refFromParser(ref: ParserEntityRef): EntityRef {
  const kind = domainToKind(ref.domain);
  return entityRef(ref.name, kind, ref.entityId);
}

export const semanticAssociationAdapter = {
  /**
   * A name → canonical-identity resolver built from the analyzer's resolved
   * entities. The regex fallback rules use this to upgrade provisional ids to
   * canonical ones (and to refine kind from the resolved domain).
   */
  buildResolver(analysis: SemanticAnalysis): (name: string) => EntityRef | undefined {
    const byName = new Map<string, EntityRef>();
    for (const e of analysis.entities) {
      const kind = domainToKind(e.domain);
      const id = e.matchedId ?? undefined;
      const ref: EntityRef = entityRef(e.matchedName ?? e.name, kind, id);
      byName.set(norm(e.name), ref);
      if (e.matchedName) byName.set(norm(e.matchedName), ref);
    }
    return (name: string) => byName.get(norm(name));
  },

  /** Convert the analyzer's resolved relationships into association observations. */
  fromAnalysis(analysis: SemanticAnalysis): AssociationObservation[] {
    const out: AssociationObservation[] = [];

    for (const edge of analysis.relationships) {
      const mapping = mapRelationType(edge.relationType);
      const source = refFromParser(edge.from);
      const target = refFromParser(edge.to);
      // Explicit membership/ownership only counts when both endpoints are real.
      const explicit = Boolean(mapping.explicit && edge.bothEndpointsResolved);

      out.push({
        source,
        target,
        associationType: mapping.type,
        explicit,
        evidence: associationEvidenceService.build({
          text: analysis.text,
          quote: `${edge.from.name} —${edge.relationType}→ ${edge.to.name}`,
          sourceMessageId: analysis.messageId,
          rulesFired: [`semantic:${edge.relationType}→${mapping.type}`],
          confidence: edge.confidence || BASE_CONFIDENCE[mapping.type],
        }),
      });
    }

    return out;
  },

  /**
   * Optional: treat resolved presence-style entities (events / venues the self
   * is grounded against) as weak self associations when the analyzer produced no
   * edge for them. Kept conservative — only emits for event/place/venue domains.
   */
  selfPresenceFromEntities(analysis: SemanticAnalysis, subject: EntityRef = SELF_SUBJECT): AssociationObservation[] {
    const out: AssociationObservation[] = [];
    for (const e of analysis.entities) {
      const kind = domainToKind(e.domain);
      if (kind !== 'event' && kind !== 'place') continue;
      const type: AssociationType = kind === 'event' ? 'attended' : 'visited';
      out.push({
        source: subject,
        target: entityRef(e.matchedName ?? e.name, kind, e.matchedId),
        associationType: type,
        evidence: associationEvidenceService.build({
          text: analysis.text,
          quote: e.name,
          sourceMessageId: analysis.messageId,
          rulesFired: [`semantic-entity:${e.domain}→${type}`],
          confidence: BASE_CONFIDENCE[type],
        }),
      });
    }
    return out;
  },
};
