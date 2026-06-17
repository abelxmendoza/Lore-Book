/**
 * Relationship knowledge service — builds entity metadata and message clusters
 * from lexical + ontology relationship signals.
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { MeaningResolutionResult } from '../meaning/meaningResolutionTypes';
import {
  type EntityRelationshipKnowledge,
  type RelationshipInputGroup,
  type DiscoveredEntityLink,
  hintToScope,
  roleToRelationshipHint,
  roleToScope,
} from './canonical/relationshipKnowledge';
import { discoverEntityLinks, groupInputsByRelationshipScope } from './relationshipDiscovery';
import { classificationService } from './classificationService';
import type { RelationshipHint } from './glossary';

export interface MessageRelationshipKnowledge {
  entityLinks: DiscoveredEntityLink[];
  groups: RelationshipInputGroup[];
  primaryScope: string | null;
  entityKnowledge: Record<string, EntityRelationshipKnowledge>;
}

class RelationshipKnowledgeService {
  buildFromLexical(lexical: LexicalAnalysisResult): MessageRelationshipKnowledge {
    const entityLinks = discoverEntityLinks(
      lexical.rawText,
      lexical.entities,
      lexical.relationships
    );
    const groups = groupInputsByRelationshipScope(
      lexical.rawText,
      entityLinks,
      lexical.entities,
      lexical.relationships
    );
    const entityKnowledge = this.buildEntityKnowledgeMap(entityLinks, groups, lexical);
    const primaryScope = groups.sort((a, b) => b.confidence - a.confidence)[0]?.scope ?? null;

    return { entityLinks, groups, primaryScope, entityKnowledge };
  }

  enrichFromMeaning(
    lexical: LexicalAnalysisResult,
    meaning: MeaningResolutionResult
  ): MessageRelationshipKnowledge {
    const base = this.buildFromLexical(lexical);

    for (const rel of meaning.resolvedRelationships) {
      const name = rel.targetName ?? rel.role;
      const knowledge = base.entityKnowledge[name] ?? this.emptyKnowledge();
      knowledge.roles.push(rel.role);
      const hint = roleToRelationshipHint(rel.role);
      if (hint) knowledge.hints.push(hint);
      knowledge.scopes.push(roleToScope(rel.role));
      if (rel.targetName) {
        knowledge.linkedEntities.push({
          name: rel.targetName,
          relationshipType: 'CO_MENTIONED_WITH',
          scope: roleToScope(rel.role),
          role: rel.role,
          confidence: rel.confidence,
        });
      }
      base.entityKnowledge[name] = knowledge;
    }

    for (const entity of meaning.resolvedEntities) {
      if (entity.kind !== 'PERSON' && entity.kind !== 'ORGANIZATION') continue;
      const k = base.entityKnowledge[entity.surface] ?? this.emptyKnowledge();
      if (entity.entityId) {
        k.linkedEntities.push({
          name: entity.surface,
          relationshipType: 'MENTIONED_IN',
          scope: 'CIRCUMSTANTIAL',
          confidence: entity.confidence,
        });
      }
      base.entityKnowledge[entity.surface] = k;
    }

    return base;
  }

  /** Metadata patch for a single entity (characters, locations, orgs). */
  buildEntityMetadataPatch(
    name: string,
    knowledge: MessageRelationshipKnowledge
  ): Record<string, unknown> {
    const entityKnowledge = knowledge.entityKnowledge[name];
    if (!entityKnowledge) return {};

    return {
      relationship_roles: entityKnowledge.roles,
      relationship_scopes: entityKnowledge.scopes,
      relationship_hints: entityKnowledge.hints,
      linked_entities: entityKnowledge.linkedEntities,
      co_mention_groups: entityKnowledge.coMentionGroups,
      relationship_knowledge_at: new Date().toISOString(),
    };
  }

  /** Merge relationship knowledge into ontology enrichment metadata. */
  buildEnrichmentMetadata(
    lexical: LexicalAnalysisResult,
    meaning?: MeaningResolutionResult
  ): Record<string, unknown> {
    const knowledge = meaning
      ? this.enrichFromMeaning(lexical, meaning)
      : this.buildFromLexical(lexical);

    return {
      relationship_links: knowledge.entityLinks.slice(0, 30),
      relationship_groups: knowledge.groups,
      relationship_primary_scope: knowledge.primaryScope,
      entity_relationship_knowledge: knowledge.entityKnowledge,
      relationship_knowledge_at: new Date().toISOString(),
    };
  }

  /** Resolve relationship scope labels from classifications table. */
  async resolveScopeClassifications(
    groups: RelationshipInputGroup[],
    userId?: string
  ): Promise<Array<{ scope: string; label: string; id?: string }>> {
    const resolved: Array<{ scope: string; label: string; id?: string }> = [];
    for (const g of groups) {
      const label = g.scope.toLowerCase();
      const row = await classificationService.findByLabel('CONCEPT', label, userId);
      resolved.push({ scope: g.scope, label, id: row?.id });
    }
    return resolved;
  }

  private buildEntityKnowledgeMap(
    links: DiscoveredEntityLink[],
    groups: RelationshipInputGroup[],
    lexical: LexicalAnalysisResult
  ): Record<string, EntityRelationshipKnowledge> {
    const map: Record<string, EntityRelationshipKnowledge> = {};

    const touch = (name: string): EntityRelationshipKnowledge => {
      if (!map[name]) map[name] = this.emptyKnowledge();
      return map[name];
    };

    for (const link of links) {
      if (link.subject !== 'self') touch(link.subject);
      if (link.object !== 'self') {
        const k = touch(link.object);
        if (link.role) k.roles.push(link.role);
        if (link.hint) k.hints.push(link.hint);
        k.scopes.push(link.scope);
        k.linkedEntities.push({
          name: link.subject === 'self' ? 'self' : link.subject,
          relationshipType: link.relationshipType,
          scope: link.scope,
          role: link.role,
          confidence: link.confidence,
        });
      }
    }

    for (const g of groups) {
      for (const name of g.entityNames) {
        const k = touch(name);
        k.scopes.push(g.scope);
        k.hints.push(g.hint);
        g.roles.forEach((r) => k.roles.push(r));
      }
    }

    // Co-mention clusters per scope group
    for (const g of groups) {
      if (g.entityNames.length >= 2) {
        for (const name of g.entityNames) {
          touch(name).coMentionGroups.push(g.entityNames);
        }
      }
    }

    for (const rel of lexical.relationships) {
      if (rel.target) touch(rel.target);
    }

    // Dedupe arrays
    for (const k of Object.values(map)) {
      k.roles = [...new Set(k.roles)];
      k.scopes = [...new Set(k.scopes)];
      k.hints = [...new Set(k.hints)];
    }

    return map;
  }

  private emptyKnowledge(): EntityRelationshipKnowledge {
    return { roles: [], scopes: [], hints: [], linkedEntities: [], coMentionGroups: [] };
  }
}

export const relationshipKnowledgeService = new RelationshipKnowledgeService();

export function mergeRelationshipHints(
  existing: RelationshipHint[] | undefined,
  incoming: RelationshipHint[]
): RelationshipHint[] {
  return [...new Set([...(existing ?? []), ...incoming])];
}

export { hintToScope };
