/**
 * Timeline Manager Service
 * Manages the 9-layer timeline hierarchy system
 */

import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import {
  TimelineLayer,
  TimelineNode,
  CreateTimelineNodePayload,
  UpdateTimelineNodePayload,
  TimelineSearchFilters,
  AutoClassificationResult,
  TimelineNodeWithChildren,
  TimelineRecommendation,
  LAYER_TABLE_MAP,
  PARENT_LAYER_MAP,
  LAYER_HIERARCHY
} from '../types/timeline';

const openai = new OpenAI({ apiKey: config.openAiKey });

class TimelineManager {
  /**
   * Create a timeline node
   */
  async createNode<T extends TimelineNode>(
    userId: string,
    layer: TimelineLayer,
    payload: CreateTimelineNodePayload
  ): Promise<T> {
    const tableName = LAYER_TABLE_MAP[layer];
    
    // Validate parent_id if provided
    if (payload.parent_id) {
      const parentLayer = PARENT_LAYER_MAP[layer];
      if (!parentLayer) {
        throw new Error(`Layer ${layer} cannot have a parent`);
      }
      const parentExists = await this.nodeExists(userId, parentLayer, payload.parent_id);
      if (!parentExists) {
        throw new Error(`Parent node ${payload.parent_id} does not exist`);
      }
    }

    const node = {
      id: uuid(),
      user_id: userId,
      title: payload.title,
      description: payload.description || null,
      start_date: payload.start_date,
      end_date: payload.end_date || null,
      tags: payload.tags || [],
      source_type: payload.source_type || 'manual',
      metadata: payload.metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(payload.parent_id ? { parent_id: payload.parent_id } : {})
    };

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .insert(node)
      .select()
      .single();

    if (error) {
      logger.error({ error, layer, userId }, 'Failed to create timeline node');
      throw error;
    }

    // Update search index
    await this.updateSearchIndex(userId, layer, data.id, payload.title, payload.description || '', payload.tags || []);

    return data as T;
  }

  /**
   * Update a timeline node
   */
  async updateNode<T extends TimelineNode>(
    userId: string,
    layer: TimelineLayer,
    nodeId: string,
    payload: UpdateTimelineNodePayload
  ): Promise<T> {
    const tableName = LAYER_TABLE_MAP[layer];

    // Validate parent_id if changing
    if (payload.parent_id !== undefined) {
      if (payload.parent_id) {
        const parentLayer = PARENT_LAYER_MAP[layer];
        if (!parentLayer) {
          throw new Error(`Layer ${layer} cannot have a parent`);
        }
        const parentExists = await this.nodeExists(userId, parentLayer, payload.parent_id);
        if (!parentExists) {
          throw new Error(`Parent node ${payload.parent_id} does not exist`);
        }
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...payload
    };

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .eq('id', nodeId)
      .eq('user_id', userId)
      .update(updateData)
      .select()
      .single();

    if (error) {
      logger.error({ error, layer, nodeId, userId }, 'Failed to update timeline node');
      throw error;
    }

    // Update search index if title/description changed
    if (payload.title || payload.description !== undefined) {
      const node = await this.getNode(userId, layer, nodeId);
      await this.updateSearchIndex(
        userId,
        layer,
        nodeId,
        payload.title || node.title,
        payload.description || node.description || '',
        payload.tags || node.tags
      );
    }

    return data as T;
  }

  /**
   * Get a single timeline node
   */
  async getNode<T extends TimelineNode>(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<T> {
    const tableName = LAYER_TABLE_MAP[layer];

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    if (error) {
      logger.error({ error, layer, nodeId, userId }, 'Failed to get timeline node');
      throw error;
    }

    return data as T;
  }

  /**
   * Get children of a timeline node
   */
  async getChildren<T extends TimelineNode>(
    userId: string,
    layer: TimelineLayer,
    parentId: string
  ): Promise<T[]> {
    const childLayer = this.getChildLayer(layer);
    if (!childLayer) {
      return [];
    }

    const tableName = LAYER_TABLE_MAP[childLayer];

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('parent_id', parentId)
      .order('start_date', { ascending: true });

    if (error) {
      logger.error({ error, layer, parentId, userId }, 'Failed to get children');
      throw error;
    }

    return (data || []) as T[];
  }

  /**
   * Get node with children (recursive tree)
   */
  async getNodeWithChildren<T extends TimelineNode>(
    userId: string,
    layer: TimelineLayer,
    nodeId: string,
    maxDepth: number = 3
  ): Promise<TimelineNodeWithChildren<T>> {
    const node = await this.getNode<T>(userId, layer, nodeId);
    const children: TimelineNodeWithChildren[] = [];

    if (maxDepth > 0) {
      const childLayer = this.getChildLayer(layer);
      if (childLayer) {
        const childNodes = await this.getChildren<T>(userId, layer, nodeId);
        for (const child of childNodes) {
          const childWithChildren = await this.getNodeWithChildren(
            userId,
            childLayer,
            child.id,
            maxDepth - 1
          );
          children.push(childWithChildren);
        }
      }
    }

    return {
      node,
      children,
      childCount: children.length
    };
  }

  /**
   * Close a timeline node (set end_date)
   */
  async closeNode(
    userId: string,
    layer: TimelineLayer,
    nodeId: string,
    endDate?: string
  ): Promise<void> {
    await this.updateNode(userId, layer, nodeId, {
      end_date: endDate || new Date().toISOString()
    });
  }

  /**
   * Delete a timeline node (cascades to children)
   */
  async deleteNode(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<void> {
    const tableName = LAYER_TABLE_MAP[layer];

    const { error } = await supabaseAdmin
      .from(tableName)
      .delete()
      .eq('id', nodeId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, layer, nodeId, userId }, 'Failed to delete timeline node');
      throw error;
    }

    // Remove from search index
    await supabaseAdmin
      .from('timeline_search_index')
      .delete()
      .eq('layer_type', layer)
      .eq('layer_id', nodeId);
  }

  /**
   * Search timeline nodes
   */
  async search(
    userId: string,
    filters: TimelineSearchFilters
  ): Promise<TimelineNode[]> {
    const layers = filters.layer_type || Object.keys(LAYER_TABLE_MAP) as TimelineLayer[];
    const results: TimelineNode[] = [];

    for (const layer of layers) {
      const tableName = LAYER_TABLE_MAP[layer];
      let query = supabaseAdmin
        .from(tableName)
        .select('*')
        .eq('user_id', userId);

      if (filters.text) {
        query = query.or(`title.ilike.%${filters.text}%,description.ilike.%${filters.text}%`);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.contains('tags', filters.tags);
      }

      if (filters.date_from) {
        query = query.gte('start_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('start_date', filters.date_to);
      }

      if (filters.parent_id) {
        query = query.eq('parent_id', filters.parent_id);
      }

      const { data, error } = await query.order('start_date', { ascending: false });

      if (error) {
        logger.warn({ error, layer }, 'Search error for layer');
        continue;
      }

      if (data) {
        results.push(...(data as TimelineNode[]));
      }
    }

    return results;
  }

  /**
   * Auto-classify text into timeline layer
   */
  async autoClassify(
    userId: string,
    text: string,
    timestamp: string,
    metadata?: Record<string, unknown>
  ): Promise<AutoClassificationResult> {
    try {
      // Get existing timeline context
      const recentNodes = await this.search(userId, {
        date_to: timestamp,
        date_from: new Date(Date.parse(timestamp) - 90 * 24 * 60 * 60 * 1000).toISOString()
      });

      const context = recentNodes
        .slice(0, 10)
        .map(n => `${n.title} (${n.start_date})`)
        .join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a timeline classification system. Analyze text and classify it into one of these timeline layers:
- mythos: Life-defining overarching narrative (years-decades)
- epoch: Major life phase (years)
- era: Significant period (months-years)
- saga: Long narrative arc (months-years)
- arc: Story arc within a saga (weeks-months)
- chapter: Discrete chapter (days-weeks)
- scene: Specific scene or event (hours-days)
- action: Single action or decision (minutes-hours)
- microaction: Very small action (seconds-minutes)

Return JSON with: { layer, parent_id (null or UUID), confidence (0-1), reasoning }

Recent timeline context:
${context || 'No recent context'}`
          },
          {
            role: 'user',
            content: `Classify this text: "${text}"\nTimestamp: ${timestamp}\nMetadata: ${JSON.stringify(metadata || {})}`
          }
        ]
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const result = JSON.parse(content) as AutoClassificationResult;
      
      // Validate layer
      if (!Object.keys(LAYER_TABLE_MAP).includes(result.layer)) {
        result.layer = 'chapter'; // Default fallback
        result.confidence = 0.5;
      }

      // Validate parent_id if provided
      if (result.parent_id) {
        const parentLayer = PARENT_LAYER_MAP[result.layer];
        if (parentLayer) {
          const parentExists = await this.nodeExists(userId, parentLayer, result.parent_id);
          if (!parentExists) {
            result.parent_id = null;
            result.confidence *= 0.8; // Reduce confidence if parent invalid
          }
        } else {
          result.parent_id = null;
        }
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'Auto-classification failed');
      // Fallback to chapter classification
      return {
        layer: 'chapter',
        parent_id: null,
        confidence: 0.3,
        reasoning: 'Classification failed, defaulting to chapter'
      };
    }
  }

  /**
   * Get recommendations for timeline
   */
  async getRecommendations(userId: string): Promise<TimelineRecommendation[]> {
    const recommendations: TimelineRecommendation[] = [];

    // Check for open chapters that might need closing
    const openChapters = await this.search(userId, {
      layer_type: ['chapter'],
      date_to: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    for (const chapter of openChapters.filter(c => !c.end_date)) {
      recommendations.push({
        type: 'close_node',
        message: `Chapter "${chapter.title}" started ${new Date(chapter.start_date).toLocaleDateString()} and might be ready to close`,
        node_id: chapter.id,
        confidence: 0.6
      });
    }

    // Check for potential duplicate chapters
    const allChapters = await this.search(userId, { layer_type: ['chapter'] });
    const titleGroups = new Map<string, typeof allChapters>();
    for (const chapter of allChapters) {
      const normalizedTitle = chapter.title.toLowerCase().trim();
      if (!titleGroups.has(normalizedTitle)) {
        titleGroups.set(normalizedTitle, []);
      }
      titleGroups.get(normalizedTitle)!.push(chapter);
    }

    for (const [title, chapters] of titleGroups.entries()) {
      if (chapters.length > 1) {
        recommendations.push({
          type: 'merge_chapters',
          message: `Found ${chapters.length} chapters with similar title: "${title}"`,
          node_id: chapters[0].id,
          confidence: 0.7
        });
      }
    }

    return recommendations;
  }

  /**
   * Auto-assign tags to a node
   */
  async autoAssignTags(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<string[]> {
    const node = await this.getNode(userId, layer, nodeId);
    
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract 3-5 relevant tags from the timeline node. Return JSON: { tags: string[] }'
          },
          {
            role: 'user',
            content: `Title: ${node.title}\nDescription: ${node.description || ''}\nDate: ${node.start_date}`
          }
        ]
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content) as { tags: string[] };
        const newTags = [...new Set([...node.tags, ...(result.tags || [])])];
        await this.updateNode(userId, layer, nodeId, { tags: newTags });
        return newTags;
      }
    } catch (error) {
      logger.warn({ error }, 'Auto-tagging failed');
    }

    return node.tags;
  }

  // Helper methods

  private async nodeExists(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<boolean> {
    const tableName = LAYER_TABLE_MAP[layer];
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('id')
      .eq('id', nodeId)
      .eq('user_id', userId)
      .single();

    return !error && !!data;
  }

  private getChildLayer(layer: TimelineLayer): TimelineLayer | null {
    const hierarchy: Record<TimelineLayer, TimelineLayer | null> = {
      mythos: 'epoch',
      epoch: 'era',
      era: 'saga',
      saga: 'arc',
      arc: 'chapter',
      chapter: 'scene',
      scene: 'action',
      action: 'microaction',
      microaction: null
    };
    return hierarchy[layer] || null;
  }

  private async updateSearchIndex(
    userId: string,
    layer: TimelineLayer,
    nodeId: string,
    title: string,
    description: string,
    tags: string[]
  ): Promise<void> {
    const searchText = `${title} ${description}`.toLowerCase();

    // Delete existing index entry
    await supabaseAdmin
      .from('timeline_search_index')
      .delete()
      .eq('layer_type', layer)
      .eq('layer_id', nodeId);

    // Insert new index entry
    await supabaseAdmin
      .from('timeline_search_index')
      .insert({
        id: uuid(),
        user_id: userId,
        layer_type: layer,
        layer_id: nodeId,
        search_text: searchText,
        tags
      });
  }
}

export const timelineManager = new TimelineManager();

