// =====================================================
// RELATIONSHIP TREE BUILDER
// Purpose: Build relationship trees for any person (family, professional, educational, social)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { entityAttributeDetector } from './entityAttributeDetector';

export type RelationshipCategory =
  | 'family'
  | 'professional'
  | 'educational'
  | 'social'
  | 'residential'
  | 'all';

export type RelationshipNode = {
  id: string;
  name: string;
  type: 'character' | 'omega_entity';
  category: RelationshipCategory;
  attributes?: {
    occupation?: string;
    workplace?: string;
    school?: string;
    degree?: string;
    current_city?: string;
    [key: string]: any;
  };
  relationships: Array<{
    toId: string;
    relationshipType: string;
    category: RelationshipCategory;
    confidence: number;
    evidence?: string;
    startTime?: string;
    endTime?: string;
  }>;
  metadata?: {
    pronouns?: string;
    avatar_url?: string;
    first_appearance?: string;
  };
};

export type RelationshipTree = {
  rootNode: RelationshipNode;
  nodes: Map<string, RelationshipNode>;
  relationships: Array<{
    fromId: string;
    toId: string;
    type: string;
    category: RelationshipCategory;
    confidence: number;
  }>;
  memberCount: number;
  relationshipCount: number;
  categories: RelationshipCategory[];
};

// Map relationship types to categories
const RELATIONSHIP_CATEGORIES: Record<string, RelationshipCategory> = {
  // Family
  parent_of: 'family',
  child_of: 'family',
  sibling_of: 'family',
  spouse_of: 'family',
  grandparent_of: 'family',
  grandchild_of: 'family',
  aunt_of: 'family',
  uncle_of: 'family',
  niece_of: 'family',
  nephew_of: 'family',
  cousin_of: 'family',
  in_law_of: 'family',
  mother_in_law_of: 'family',
  father_in_law_of: 'family',
  son_in_law_of: 'family',
  daughter_in_law_of: 'family',
  step_parent_of: 'family',
  step_child_of: 'family',
  step_sibling_of: 'family',
  half_sibling_of: 'family',
  adopted_parent_of: 'family',
  adopted_child_of: 'family',
  godparent_of: 'family',
  godchild_of: 'family',
  related_to: 'family',

  // Professional
  works_for: 'professional',
  employed_by: 'professional',
  manages: 'professional',
  managed_by: 'professional',
  colleague_of: 'professional',
  reports_to: 'professional',
  supervises: 'professional',
  contractor_for: 'professional',
  consultant_for: 'professional',
  freelancer_for: 'professional',
  founder_of: 'professional',
  co_founder_of: 'professional',
  owner_of: 'professional',
  shareholder_of: 'professional',
  board_member_of: 'professional',
  advisor_to: 'professional',
  intern_at: 'professional',
  volunteer_at: 'professional',
  former_employee_of: 'professional',

  // Educational
  studies_at: 'educational',
  studied_at: 'educational',
  teaches_at: 'educational',
  taught_at: 'educational',
  alumni_of: 'educational',
  graduated_from: 'educational',
  attended: 'educational',
  professor_at: 'educational',
  researcher_at: 'educational',
  dean_of: 'educational',
  principal_of: 'educational',
  student_of: 'educational',
  classmate_of: 'educational',
  roommate_at: 'educational',
  mentor_of: 'educational',
  mentored_by: 'educational',

  // Social
  friend_of: 'social',
  best_friend_of: 'social',
  childhood_friend_of: 'social',
  close_friend_of: 'social',
  acquaintance_of: 'social',
  enemy_of: 'social',
  rival_of: 'social',
  ex_friend_of: 'social',

  // Residential
  lives_with: 'residential',
  lived_with: 'residential',
  neighbor_of: 'residential',
  roommate_of: 'residential',
  landlord_of: 'residential',
  tenant_of: 'residential',
};

export class RelationshipTreeBuilder {
  /**
   * Build relationship tree for a specific entity
   */
  async buildTree(
    userId: string,
    rootEntityId: string,
    rootEntityType: 'omega_entity' | 'character',
    category: RelationshipCategory = 'all',
    maxDepth: number = 3
  ): Promise<RelationshipTree | null> {
    try {
      // Get root entity info
      const rootEntity = await this.getEntityInfo(userId, rootEntityId, rootEntityType);
      if (!rootEntity) {
        return null;
      }

      // Get attributes for root entity
      const attributes = await entityAttributeDetector.getEntityAttributes(
        userId,
        rootEntityId,
        rootEntityType,
        true
      );

      const rootNode: RelationshipNode = {
        id: rootEntityId,
        name: rootEntity.name,
        type: rootEntityType,
        category: 'all',
        attributes: this.buildAttributesMap(attributes),
        relationships: [],
        metadata: rootEntity.metadata,
      };

      const nodes = new Map<string, RelationshipNode>([[rootEntityId, rootNode]]);
      const relationships: Array<{
        fromId: string;
        toId: string;
        type: string;
        category: RelationshipCategory;
        confidence: number;
      }> = [];

      // Build tree recursively
      await this.buildTreeRecursive(
        userId,
        rootEntityId,
        rootEntityType,
        rootNode,
        nodes,
        relationships,
        category,
        maxDepth,
        0
      );

      // Determine categories present
      const categories = new Set<RelationshipCategory>();
      relationships.forEach(rel => {
        if (rel.category !== 'all') {
          categories.add(rel.category);
        }
      });

      return {
        rootNode,
        nodes,
        relationships,
        memberCount: nodes.size,
        relationshipCount: relationships.length,
        categories: Array.from(categories),
      };
    } catch (error) {
      logger.error({ error, userId, rootEntityId }, 'Failed to build relationship tree');
      return null;
    }
  }

  /**
   * Recursively build tree
   */
  private async buildTreeRecursive(
    userId: string,
    entityId: string,
    entityType: 'omega_entity' | 'character',
    parentNode: RelationshipNode,
    nodes: Map<string, RelationshipNode>,
    relationships: Array<{
      fromId: string;
      toId: string;
      type: string;
      category: RelationshipCategory;
      confidence: number;
    }>,
    category: RelationshipCategory,
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth >= maxDepth) {
      return;
    }

    // Get relationships for this entity
    const entityRelationships = await this.getEntityRelationships(
      userId,
      entityId,
      entityType
    );

    for (const rel of entityRelationships) {
      // Filter by category if specified
      const relCategory = RELATIONSHIP_CATEGORIES[rel.relationshipType] || 'all';
      if (category !== 'all' && relCategory !== category && relCategory !== 'all') {
        continue;
      }

      // Skip if relationship already processed
      const relKey = `${rel.fromEntityId}-${rel.toEntityId}-${rel.relationshipType}`;
      if (relationships.find(r => `${r.fromId}-${r.toId}-${r.type}` === relKey)) {
        continue;
      }

      // Get target entity info
      let targetNode = nodes.get(rel.toEntityId);
      if (!targetNode) {
        const targetEntity = await this.getEntityInfo(
          userId,
          rel.toEntityId,
          rel.toEntityType
        );
        if (!targetEntity) {
          continue;
        }

        // Get attributes for target entity
        const targetAttributes = await entityAttributeDetector.getEntityAttributes(
          userId,
          rel.toEntityId,
          rel.toEntityType,
          true
        );

        targetNode = {
          id: rel.toEntityId,
          name: targetEntity.name,
          type: rel.toEntityType,
          category: relCategory,
          attributes: this.buildAttributesMap(targetAttributes),
          relationships: [],
          metadata: targetEntity.metadata,
        };

        nodes.set(rel.toEntityId, targetNode);
      }

      // Add relationship
      const relationship = {
        fromId: rel.fromEntityId,
        toId: rel.toEntityId,
        type: rel.relationshipType,
        category: relCategory,
        confidence: rel.confidence,
      };

      relationships.push(relationship);

      // Add to parent node's relationships
      parentNode.relationships.push({
        toId: rel.toEntityId,
        relationshipType: rel.relationshipType,
        category: relCategory,
        confidence: rel.confidence,
        evidence: rel.evidence,
        startTime: rel.startTime,
        endTime: rel.endTime,
      });

      // Recursively build for target entity
      await this.buildTreeRecursive(
        userId,
        rel.toEntityId,
        rel.toEntityType,
        targetNode,
        nodes,
        relationships,
        category,
        maxDepth,
        currentDepth + 1
      );
    }
  }

  /**
   * Get entity relationships
   */
  private async getEntityRelationships(
    userId: string,
    entityId: string,
    entityType: 'omega_entity' | 'character'
  ): Promise<
    Array<{
      fromEntityId: string;
      fromEntityType: 'omega_entity' | 'character';
      toEntityId: string;
      toEntityType: 'omega_entity' | 'character';
      relationshipType: string;
      confidence: number;
      evidence?: string;
      startTime?: string;
      endTime?: string;
    }>
  > {
    try {
      // Get from entity_relationships
      const { data: relationships } = await supabaseAdmin
        .from('entity_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(
          `and(from_entity_id.eq.${entityId},from_entity_type.eq.${entityType}),and(to_entity_id.eq.${entityId},to_entity_type.eq.${entityType})`
        )
        .eq('is_active', true);

      if (!relationships) {
        return [];
      }

      return relationships.map(rel => ({
        fromEntityId: rel.from_entity_id,
        fromEntityType: rel.from_entity_type as 'omega_entity' | 'character',
        toEntityId: rel.to_entity_id,
        toEntityType: rel.to_entity_type as 'omega_entity' | 'character',
        relationshipType: rel.relationship_type,
        confidence: rel.confidence,
        evidence: rel.metadata?.evidence,
        startTime: rel.start_time,
        endTime: rel.end_time,
      }));
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get entity relationships');
      return [];
    }
  }

  /**
   * Get entity info
   */
  private async getEntityInfo(
    userId: string,
    entityId: string,
    entityType: 'omega_entity' | 'character'
  ): Promise<{ name: string; metadata?: any } | null> {
    try {
      if (entityType === 'character') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('name, metadata')
          .eq('id', entityId)
          .eq('user_id', userId)
          .single();

        if (character) {
          return {
            name: character.name,
            metadata: character.metadata,
          };
        }
      } else {
        // Query omega_entities table
        const { data: entity } = await supabaseAdmin
          .from('omega_entities')
          .select('primary_name, metadata')
          .eq('id', entityId)
          .eq('user_id', userId)
          .single();

        if (entity) {
          return {
            name: entity.primary_name,
            metadata: entity.metadata,
          };
        }
      }

      return null;
    } catch (error) {
      logger.debug({ error, entityId, entityType }, 'Failed to get entity info');
      return null;
    }
  }

  /**
   * Build attributes map from attribute array
   */
  private buildAttributesMap(attributes: Array<{ attributeType: string; attributeValue: string }>): Record<string, string> {
    const map: Record<string, string> = {};
    for (const attr of attributes) {
      map[attr.attributeType] = attr.attributeValue;
    }
    return map;
  }

  /**
   * Save tree to database
   */
  async saveTree(userId: string, tree: RelationshipTree): Promise<void> {
    try {
      const treeData = {
        rootNode: {
          ...tree.rootNode,
          relationships: tree.rootNode.relationships.map(r => ({
            ...r,
            toNode: Array.from(tree.nodes.values()).find(n => n.id === r.toId),
          })),
        },
        nodes: Array.from(tree.nodes.values()),
        relationships: tree.relationships,
      };

      await supabaseAdmin
        .from('relationship_trees')
        .upsert({
          user_id: userId,
          root_entity_id: tree.rootNode.id,
          root_entity_type: tree.rootNode.type,
          tree_data: treeData,
          member_count: tree.memberCount,
          relationship_count: tree.relationshipCount,
          categories: tree.categories,
          confidence_score: 0.7, // Can be calculated from relationship confidences
          last_updated: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('root_entity_id', tree.rootNode.id)
        .eq('root_entity_type', tree.rootNode.type);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save relationship tree');
    }
  }

  /**
   * Get saved tree from database
   */
  async getSavedTree(
    userId: string,
    rootEntityId: string,
    rootEntityType: 'omega_entity' | 'character'
  ): Promise<RelationshipTree | null> {
    try {
      const { data: saved } = await supabaseAdmin
        .from('relationship_trees')
        .select('*')
        .eq('user_id', userId)
        .eq('root_entity_id', rootEntityId)
        .eq('root_entity_type', rootEntityType)
        .single();

      if (!saved) {
        return null;
      }

      // Reconstruct tree from saved data
      const treeData = saved.tree_data as any;
      const nodes = new Map<string, RelationshipNode>();
      for (const node of treeData.nodes || []) {
        nodes.set(node.id, node);
      }

      return {
        rootNode: treeData.rootNode,
        nodes,
        relationships: treeData.relationships || [],
        memberCount: saved.member_count || 0,
        relationshipCount: saved.relationship_count || 0,
        categories: saved.categories || [],
      };
    } catch (error) {
      logger.error({ error, userId, rootEntityId }, 'Failed to get saved tree');
      return null;
    }
  }
}

export const relationshipTreeBuilder = new RelationshipTreeBuilder();
