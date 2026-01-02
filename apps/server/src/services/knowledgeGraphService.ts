import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type { MemoryComponent, GraphEdge, GraphEdgeType } from '../types';
import { supabaseAdmin } from './supabaseClient';

/**
 * Knowledge Graph Service
 * Builds and manages relationships between memory components
 * Creates edges based on semantic similarity, shared characters, tags, timeline nodes
 */
class KnowledgeGraphService {
  private readonly SEMANTIC_THRESHOLD = 0.7; // Minimum cosine similarity for semantic links
  private readonly MIN_WEIGHT = 0.3; // Minimum weight to store edge

  /**
   * Build graph edges for a component
   * Creates semantic, social, thematic, and narrative links
   */
  async buildEdgesForComponent(
    component: MemoryComponent,
    userId: string
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    // Get all other components for the user
    const { data: allComponents, error } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .neq('id', component.id)
      .limit(100); // Limit for performance

    if (error) {
      logger.error({ error, componentId: component.id }, 'Failed to fetch components for graph building');
      return edges;
    }

    const otherComponents = (allComponents ?? []) as MemoryComponent[];

    // Filter to components from same user's entries
    const userComponents = await this.filterUserComponents(otherComponents, userId);

    // 1. Semantic links (embedding similarity)
    if (component.embedding) {
      const semanticEdges = await this.buildSemanticEdges(component, userComponents);
      edges.push(...semanticEdges);
    }

    // 2. Social links (shared characters)
    const socialEdges = this.buildSocialEdges(component, userComponents);
    edges.push(...socialEdges);

    // 3. Thematic links (shared tags)
    const thematicEdges = this.buildThematicEdges(component, userComponents);
    edges.push(...thematicEdges);

    // 4. Narrative links (shared timeline nodes)
    const narrativeEdges = await this.buildNarrativeEdges(component, userComponents);
    edges.push(...narrativeEdges);

    // 5. Temporal links (close timestamps)
    const temporalEdges = this.buildTemporalEdges(component, userComponents);
    edges.push(...temporalEdges);

    // Save edges to database
    const savedEdges = await this.saveEdges(edges);

    return savedEdges;
  }

  /**
   * Filter components to only those belonging to user
   */
  private async filterUserComponents(
    components: MemoryComponent[],
    userId: string
  ): Promise<MemoryComponent[]> {
    if (components.length === 0) return [];

    const entryIds = [...new Set(components.map(c => c.journal_entry_id))];

    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .in('id', entryIds);

    if (!entries) return [];

    const validEntryIds = new Set(entries.map(e => e.id));
    return components.filter(c => validEntryIds.has(c.journal_entry_id));
  }

  /**
   * Build semantic edges based on embedding similarity
   */
  private async buildSemanticEdges(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    if (!component.embedding) return edges;

    const componentEmbedding = component.embedding;

    for (const other of otherComponents) {
      if (!other.embedding) continue;

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(componentEmbedding, other.embedding);

      if (similarity >= this.SEMANTIC_THRESHOLD) {
        edges.push({
          id: uuid(),
          source_component_id: component.id,
          target_component_id: other.id,
          relationship_type: 'semantic',
          weight: similarity,
          metadata: {
            similarity,
            method: 'embedding_cosine',
          },
        } as GraphEdge);
      }
    }

    return edges;
  }

  /**
   * Build social edges based on shared characters
   */
  private buildSocialEdges(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (component.characters_involved.length === 0) return edges;

    const componentCharacters = new Set(component.characters_involved.map(c => c.toLowerCase()));

    for (const other of otherComponents) {
      if (other.characters_involved.length === 0) continue;

      const otherCharacters = new Set(other.characters_involved.map(c => c.toLowerCase()));
      
      // Find intersection
      const shared = [...componentCharacters].filter(c => otherCharacters.has(c));

      if (shared.length > 0) {
        const weight = Math.min(shared.length / Math.max(componentCharacters.size, otherCharacters.size), 1.0);
        
        if (weight >= this.MIN_WEIGHT) {
          edges.push({
            id: crypto.randomUUID(),
            source_component_id: component.id,
            target_component_id: other.id,
            relationship_type: 'social',
            weight,
            metadata: {
              shared_characters: shared,
              shared_count: shared.length,
            },
          } as GraphEdge);
        }
      }
    }

    return edges;
  }

  /**
   * Build thematic edges based on shared tags
   */
  private buildThematicEdges(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (component.tags.length === 0) return edges;

    const componentTags = new Set(component.tags.map(t => t.toLowerCase()));

    for (const other of otherComponents) {
      if (other.tags.length === 0) continue;

      const otherTags = new Set(other.tags.map(t => t.toLowerCase()));
      
      // Find intersection
      const shared = [...componentTags].filter(t => otherTags.has(t));

      if (shared.length > 0) {
        const weight = Math.min(shared.length / Math.max(componentTags.size, otherTags.size), 1.0);
        
        if (weight >= this.MIN_WEIGHT) {
          edges.push({
            id: crypto.randomUUID(),
            source_component_id: component.id,
            target_component_id: other.id,
            relationship_type: 'thematic',
            weight,
            metadata: {
              shared_tags: shared,
              shared_count: shared.length,
            },
          } as GraphEdge);
        }
      }
    }

    return edges;
  }

  /**
   * Build narrative edges based on shared timeline nodes
   */
  private async buildNarrativeEdges(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    // Get timeline links for component
    const { data: componentLinks } = await supabaseAdmin
      .from('timeline_links')
      .select('*')
      .eq('component_id', component.id)
      .single();

    if (!componentLinks) return edges;

    // Check each other component for shared timeline nodes
    for (const other of otherComponents) {
      const { data: otherLinks } = await supabaseAdmin
        .from('timeline_links')
        .select('*')
        .eq('component_id', other.id)
        .single();

      if (!otherLinks) continue;

      // Check for shared timeline nodes at any level
      const sharedLevels: string[] = [];
      const levels = ['mythos_id', 'epoch_id', 'era_id', 'saga_id', 'arc_id', 'chapter_id', 'scene_id', 'action_id', 'micro_action_id'];
      
      for (const level of levels) {
        const compValue = (componentLinks as any)[level];
        const otherValue = (otherLinks as any)[level];
        
        if (compValue && otherValue && compValue === otherValue) {
          sharedLevels.push(level);
        }
      }

      if (sharedLevels.length > 0) {
        const weight = Math.min(sharedLevels.length / levels.length, 1.0);
        
        if (weight >= this.MIN_WEIGHT) {
          edges.push({
            id: crypto.randomUUID(),
            source_component_id: component.id,
            target_component_id: other.id,
            relationship_type: 'narrative',
            weight,
            metadata: {
              shared_levels: sharedLevels,
              shared_count: sharedLevels.length,
            },
          } as GraphEdge);
        }
      }
    }

    return edges;
  }

  /**
   * Build temporal edges based on close timestamps
   */
  private buildTemporalEdges(
    component: MemoryComponent,
    otherComponents: MemoryComponent[]
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (!component.timestamp) return edges;

    const componentTime = new Date(component.timestamp).getTime();

    for (const other of otherComponents) {
      if (!other.timestamp) continue;

      const otherTime = new Date(other.timestamp).getTime();
      const timeDiff = Math.abs(componentTime - otherTime);
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      // Stronger weight for closer timestamps (within 7 days)
      if (daysDiff <= 7) {
        const weight = Math.max(0, 1 - (daysDiff / 7));
        
        if (weight >= this.MIN_WEIGHT) {
          edges.push({
            id: crypto.randomUUID(),
            source_component_id: component.id,
            target_component_id: other.id,
            relationship_type: 'temporal',
            weight,
            metadata: {
              days_diff: Math.round(daysDiff * 10) / 10,
            },
          } as GraphEdge);
        }
      }
    }

    return edges;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Save edges to database (with deduplication)
   */
  private async saveEdges(edges: GraphEdge[]): Promise<GraphEdge[]> {
    if (edges.length === 0) return [];

    const savedEdges: GraphEdge[] = [];

    // Batch insert (PostgreSQL supports up to 1000 rows)
    const batchSize = 100;
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize);

      const { data, error } = await supabaseAdmin
        .from('graph_edges')
        .insert(batch.map(e => ({
          id: e.id,
          source_component_id: e.source_component_id,
          target_component_id: e.target_component_id,
          relationship_type: e.relationship_type,
          weight: e.weight,
          metadata: e.metadata || {},
        })))
        .select();

      if (error) {
        // If unique constraint violation, edge already exists (skip)
        if (error.code === '23505') {
          logger.debug({ error }, 'Edge already exists, skipping');
          continue;
        }
        logger.error({ error }, 'Failed to save graph edges');
        continue;
      }

      savedEdges.push(...(data as GraphEdge[]));
    }

    return savedEdges;
  }

  /**
   * Get neighbors for a component
   */
  async getNeighbors(
    componentId: string,
    relationshipType?: GraphEdgeType,
    limit: number = 20
  ): Promise<GraphEdge[]> {
    let query = supabaseAdmin
      .from('graph_edges')
      .select('*')
      .or(`source_component_id.eq.${componentId},target_component_id.eq.${componentId}`)
      .order('weight', { ascending: false })
      .limit(limit);

    if (relationshipType) {
      query = query.eq('relationship_type', relationshipType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, componentId }, 'Failed to get graph neighbors');
      throw error;
    }

    return (data ?? []) as GraphEdge[];
  }

  /**
   * Get path between two components
   */
  async getPath(
    sourceComponentId: string,
    targetComponentId: string,
    maxDepth: number = 3
  ): Promise<GraphEdge[]> {
    // Simple BFS path finding
    const visited = new Set<string>();
    const queue: Array<{ componentId: string; path: GraphEdge[] }> = [
      { componentId: sourceComponentId, path: [] },
    ];

    while (queue.length > 0) {
      const { componentId, path } = queue.shift()!;

      if (componentId === targetComponentId) {
        return path;
      }

      if (visited.has(componentId) || path.length >= maxDepth) {
        continue;
      }

      visited.add(componentId);

      const neighbors = await this.getNeighbors(componentId, undefined, 50);
      
      for (const edge of neighbors) {
        const nextComponentId =
          edge.source_component_id === componentId
            ? edge.target_component_id
            : edge.source_component_id;

        if (!visited.has(nextComponentId)) {
          queue.push({
            componentId: nextComponentId,
            path: [...path, edge],
          });
        }
      }
    }

    return []; // No path found
  }

  /**
   * Batch build edges for multiple components
   */
  async batchBuildEdges(components: MemoryComponent[], userId: string): Promise<GraphEdge[]> {
    const allEdges: GraphEdge[] = [];

    // Process in smaller batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < components.length; i += batchSize) {
      const batch = components.slice(i, i + batchSize);

      const batchEdges = await Promise.all(
        batch.map(component => this.buildEdgesForComponent(component, userId))
      );

      allEdges.push(...batchEdges.flat());
    }

    return allEdges;
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();

