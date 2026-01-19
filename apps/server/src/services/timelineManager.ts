/**
 * Timeline Manager Service
 * Manages the 9-layer timeline hierarchy system
 */

import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
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

import { supabaseAdmin } from './supabaseClient';
import { titleGenerationService } from './titleGenerationService';

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

    // Auto-generate title if not provided or is generic
    let finalTitle = payload.title;
    if (!finalTitle || finalTitle.trim() === '' || finalTitle.toLowerCase().includes('untitled') || finalTitle.toLowerCase().includes('new ')) {
      try {
        // Create a temporary node object for title generation
        const tempNode: TimelineNode = {
          id: uuid(),
          user_id: userId,
          title: payload.title || `Untitled ${layer}`,
          description: payload.description || null,
          start_date: payload.start_date,
          end_date: payload.end_date || null,
          tags: payload.tags || [],
          source_type: payload.source_type || 'manual',
          metadata: payload.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(payload.parent_id ? { parent_id: payload.parent_id } : {})
        } as TimelineNode;
        
        // Generate title based on context
        finalTitle = await this.autoGenerateTitle(userId, layer, tempNode);
        // If generation fails, use fallback
        if (!finalTitle || finalTitle.includes('Untitled')) {
          finalTitle = payload.title || `Untitled ${layer}`;
        }
      } catch (error) {
        logger.warn({ error }, 'Title auto-generation failed during creation, using provided title');
        finalTitle = payload.title || `Untitled ${layer}`;
      }
    }

    const node = {
      id: uuid(),
      user_id: userId,
      title: finalTitle,
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
    await this.updateSearchIndex(userId, layer, data.id, finalTitle, payload.description || '', payload.tags || []);

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

    // Get current node to check if title needs regeneration
    const currentNode = await this.getNode(userId, layer, nodeId);
    const currentTitle = payload.title !== undefined ? payload.title : currentNode.title;
    const needsTitleRegeneration = 
      (currentTitle.toLowerCase().includes('untitled') || 
       currentTitle.toLowerCase().includes('new ') ||
       currentTitle === `Untitled ${layer}`) &&
      (layer === 'arc' || layer === 'saga' || layer === 'era');

    // Auto-generate title if needed
    let finalTitle = currentTitle;
    if (needsTitleRegeneration) {
      try {
        const updatedNode = {
          ...currentNode,
          ...payload,
          start_date: payload.start_date || currentNode.start_date,
          end_date: payload.end_date !== undefined ? payload.end_date : currentNode.end_date
        };
        finalTitle = await this.autoGenerateTitle(userId, layer, updatedNode);
        if (finalTitle && !finalTitle.includes('Untitled')) {
          payload.title = finalTitle;
        }
      } catch (error) {
        logger.debug({ error }, 'Title regeneration failed during update, keeping existing');
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

  /**
   * Auto-generate title for a timeline node based on its children and context
   * Can be called with a temporary node object for creation-time generation
   */
  async autoGenerateTitle(
    userId: string,
    layer: TimelineLayer,
    nodeIdOrNode: string | TimelineNode
  ): Promise<string> {
    const node = typeof nodeIdOrNode === 'string' 
      ? await this.getNode(userId, layer, nodeIdOrNode)
      : nodeIdOrNode;
    const childLayer = this.getChildLayer(layer);
    
    try {
      // Get children for context (only if node exists in DB)
      const children = (childLayer && typeof nodeIdOrNode === 'string') 
        ? await this.getChildren(userId, layer, nodeIdOrNode) 
        : [];
      
      // Get related entries/memories within date range
      const entriesQuery = supabaseAdmin
        .from('journal_entries')
        .select('content, summary, date')
        .eq('user_id', userId)
        .gte('date', node.start_date)
        .order('date', { ascending: true })
        .limit(20);
      
      if (node.end_date) {
        entriesQuery.lte('date', node.end_date);
      }
      
      const { data: entries } = await entriesQuery;

      const layerDescriptions: Record<TimelineLayer, string> = {
        mythos: 'life-defining overarching narrative spanning years to decades',
        epoch: 'major life phase spanning years',
        era: 'significant period spanning months to years',
        saga: 'long narrative arc spanning months to years',
        arc: 'story arc within a saga spanning weeks to months',
        chapter: 'discrete chapter spanning days to weeks',
        scene: 'specific scene or event spanning hours to days',
        action: 'single action or decision spanning minutes to hours',
        microaction: 'very small action spanning seconds to minutes'
      };

      const layerExamples: Record<TimelineLayer, string[]> = {
        mythos: ['The Awakening', 'The Journey', 'Transformation', 'The Quest'],
        epoch: ['College Years', 'Career Beginnings', 'Family Life', 'Exploration'],
        era: ['The Startup Phase', 'The Learning Period', 'Creative Surge', 'Reflection Time'],
        saga: ['Building the Business', 'Finding My Voice', 'The Adventure', 'New Horizons'],
        arc: ['First Steps', 'Breaking Through', 'The Challenge', 'Turning Point'],
        chapter: ['Monday Morning', 'The Meeting', 'Discovery', 'Revelation'],
        scene: ['Coffee Shop Encounter', 'Sunset Walk', 'The Conversation'],
        action: ['Made Decision', 'Sent Email', 'Started Project'],
        microaction: ['Opened Door', 'Clicked Button', 'Took Step']
      };

      const contextParts: string[] = [];
      
      if (children.length > 0) {
        const childTitles = children.slice(0, 5).map(c => c.title).join(', ');
        contextParts.push(`Contains: ${childTitles}`);
      }
      
      if (entries && entries.length > 0) {
        const entryContent = entries
          .slice(0, 5)
          .map(e => e.summary || e.content.substring(0, 100))
          .join('\n');
        contextParts.push(`Related memories:\n${entryContent}`);
      }

      // Use specialized title generation service for arcs, sagas, and eras
      if (layer === 'arc' || layer === 'saga' || layer === 'era') {
        try {
          const entriesData = entries?.map((e: any) => ({
            content: e.content,
            date: e.date,
            summary: e.summary
          })) || [];

          const dateRange = {
            from: node.start_date,
            to: node.end_date || undefined
          };

          // Get parent title for context
          let parentTitle: string | undefined;
          if (node.parent_id && layer === 'arc') {
            try {
              const parent = await this.getNode(userId, 'saga', node.parent_id);
              parentTitle = parent.title;
            } catch {
              // Ignore if parent not found
            }
          }

          if (layer === 'arc') {
            return await titleGenerationService.generateArcTitle(userId, entriesData, dateRange, parentTitle);
          } else if (layer === 'saga') {
            // Try to get arcs first
            const { data: arcs } = await supabaseAdmin
              .from('timeline_arcs')
              .select('title, description')
              .eq('user_id', userId)
              .gte('start_date', node.start_date)
              .order('start_date', { ascending: true })
              .limit(10);
            
            if (node.end_date && arcs) {
              // Filter arcs by end date
              arcs.filter((a: any) => !a.start_date || a.start_date <= node.end_date);
            }

            if (arcs && arcs.length > 0) {
              return await titleGenerationService.generateSagaTitle(
                userId,
                arcs.map((a: any) => ({ title: a.title, description: a.description })),
                undefined,
                dateRange
              );
            }
            return await titleGenerationService.generateSagaTitle(userId, undefined, entriesData, dateRange);
          } else if (layer === 'era') {
            // Try to get sagas first
            const { data: sagas } = await supabaseAdmin
              .from('timeline_sagas')
              .select('title, description')
              .eq('user_id', userId)
              .gte('start_date', node.start_date)
              .order('start_date', { ascending: true })
              .limit(10);
            
            if (node.end_date && sagas) {
              sagas.filter((s: any) => !s.start_date || s.start_date <= node.end_date);
            }

            if (sagas && sagas.length > 0) {
              return await titleGenerationService.generateEraTitle(
                userId,
                sagas.map((s: any) => ({ title: s.title, description: s.description })),
                undefined,
                dateRange
              );
            }
            return await titleGenerationService.generateEraTitle(userId, undefined, entriesData, dateRange);
          }
        } catch (error) {
          logger.debug({ error, layer }, 'Specialized title generation failed, falling back to generic');
        }
      }

      // Fallback to generic title generation for other layers
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a compelling, concise title (2-6 words) for a ${layer} - ${layerDescriptions[layer]}. 
Examples: ${layerExamples[layer].join(', ')}. 
Return only the title, no quotes or extra text.`
          },
          {
            role: 'user',
            content: `Generate a title for this ${layer}:\nDate: ${node.start_date}${node.end_date ? ` to ${node.end_date}` : ''}\nDescription: ${node.description || 'No description'}\nTags: ${node.tags.join(', ') || 'None'}\n${contextParts.length > 0 ? contextParts.join('\n\n') : 'No additional context'}`
          }
        ]
      });

      const title = completion.choices[0]?.message?.content?.trim() || `Untitled ${layer}`;
      return title.replace(/^["']|["']$/g, '').replace(/^#+\s*/, '');
    } catch (error) {
      logger.error({ error, layer, nodeId: typeof nodeIdOrNode === 'string' ? nodeIdOrNode : 'temp' }, 'Auto-title generation failed');
      return `Untitled ${layer}`;
    }
  }

  /**
   * Refresh/regenerate title for an existing timeline node
   * Useful when content has accumulated and title should be updated
   */
  async refreshTitle(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<string> {
    const node = await this.getNode(userId, layer, nodeId);
    const newTitle = await this.autoGenerateTitle(userId, layer, node);
    
    if (newTitle && newTitle !== node.title && !newTitle.includes('Untitled')) {
      await this.updateNode(userId, layer, nodeId, { title: newTitle });
    }
    
    return newTitle;
  }

  /**
   * Auto-generate summary for a timeline node based on its children and related entries
   */
  async autoGenerateSummary(
    userId: string,
    layer: TimelineLayer,
    nodeId: string
  ): Promise<string> {
    const node = await this.getNode(userId, layer, nodeId);
    const childLayer = this.getChildLayer(layer);
    
    try {
      // Get children for context
      const children = childLayer ? await this.getChildren(userId, layer, nodeId) : [];
      
      // Get related entries/memories within date range
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('content, summary, date')
        .eq('user_id', userId)
        .gte('date', node.start_date)
        .lte('date', node.end_date || new Date().toISOString())
        .order('date', { ascending: true })
        .limit(30);

      const contextParts: string[] = [];
      
      if (children.length > 0) {
        const childInfo = children
          .slice(0, 10)
          .map(c => `- ${c.title}${c.description ? `: ${c.description}` : ''}`)
          .join('\n');
        contextParts.push(`Contains ${children.length} ${childLayer}${children.length !== 1 ? 's' : ''}:\n${childInfo}`);
      }
      
      if (entries && entries.length > 0) {
        const entryContent = entries
          .map(e => `[${e.date}] ${e.summary || e.content.substring(0, 150)}`)
          .join('\n\n');
        contextParts.push(`Related memories (${entries.length}):\n${entryContent}`);
      }

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Generate a concise, meaningful summary (2-4 sentences) for this ${layer} timeline node. 
Capture the essence, key themes, and significance. Write in third person or neutral voice.`
          },
          {
            role: 'user',
            content: `Generate a summary for this ${layer}:\nTitle: ${node.title}\nDate: ${node.start_date}${node.end_date ? ` to ${node.end_date}` : ''}\nTags: ${node.tags.join(', ') || 'None'}\n${contextParts.length > 0 ? '\n' + contextParts.join('\n\n') : '\nNo additional context available.'}`
          }
        ]
      });

      const summary = completion.choices[0]?.message?.content?.trim() || '';
      return summary;
    } catch (error) {
      logger.error({ error, layer, nodeId }, 'Auto-summary generation failed');
      return '';
    }
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

