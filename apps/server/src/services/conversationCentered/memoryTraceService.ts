// =====================================================
// MEMORY TRACE SERVICE
// Purpose: Reconstruct full lineage from chat → memory → strategy
// Shows how language becomes structured memory and influences behavior
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ExtractedUnit } from '../../types/conversationCentered';

export type TraceNode = {
  id: string;
  type: 'chat_message' | 'conversation_message' | 'utterance' | 'extracted_unit' | 
        'perception_entry' | 'journal_entry' | 'insight' | 'resolved_event' | 
        'knowledge_unit' | 'action' | 'reward';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
  confidence?: number;
  children: TraceNode[];
};

export type MemoryTrace = {
  root: TraceNode;
  depth: number;
  totalNodes: number;
  tracePath: string[]; // IDs in order from root to leaf
  summary: {
    chatMessages: number;
    utterances: number;
    extractedUnits: number;
    memoryArtifacts: number;
    events: number;
  };
};

/**
 * Memory Trace Service
 * Reconstructs full lineage showing how chat becomes memory
 */
export class MemoryTraceService {
  /**
   * Trace from chat message ID
   * Reconstructs full flow: chat → utterance → unit → memory → event
   */
  async traceFromChatMessage(
    userId: string,
    chatMessageId: string
  ): Promise<MemoryTrace | null> {
    try {
      // Get chat message
      const { data: chatMessage } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('id', chatMessageId)
        .eq('user_id', userId)
        .single();

      if (!chatMessage) {
        return null;
      }

      // Build trace tree starting from chat message
      const root: TraceNode = {
        id: chatMessage.id,
        type: 'chat_message',
        content: chatMessage.content,
        timestamp: chatMessage.created_at,
        metadata: {
          role: chatMessage.role,
          session_id: chatMessage.session_id,
        },
        children: [],
      };

      // Find conversation message (if ingested)
      const conversationMessage = await this.findConversationMessage(chatMessageId);
      if (conversationMessage) {
        const convNode: TraceNode = {
          id: conversationMessage.id,
          type: 'conversation_message',
          content: conversationMessage.content,
          timestamp: conversationMessage.created_at,
          metadata: conversationMessage.metadata,
          children: [],
        };
        root.children.push(convNode);

        // Find utterances
        const utterances = await this.findUtterances(conversationMessage.id);
        for (const utterance of utterances) {
          const utteranceNode: TraceNode = {
            id: utterance.id,
            type: 'utterance',
            content: utterance.normalized_text,
            timestamp: utterance.created_at,
            metadata: {
              original_text: utterance.original_text,
              language: utterance.language,
            },
            children: [],
          };
          convNode.children.push(utteranceNode);

          // Find extracted units
          const units = await this.findExtractedUnits(utterance.id);
          for (const unit of units) {
            const unitNode: TraceNode = {
              id: unit.id,
              type: 'extracted_unit',
              content: unit.content,
              timestamp: unit.created_at,
              confidence: unit.confidence,
              metadata: {
                unit_type: unit.type,
                temporal_context: unit.temporal_context,
                entity_ids: unit.entity_ids,
                knowledge_unit_id: unit.metadata?.knowledge_unit_id,
              },
              children: [],
            };
            utteranceNode.children.push(unitNode);

            // Find memory artifacts created from this unit
            await this.attachMemoryArtifacts(unitNode, userId, unit);

            // Find knowledge unit if linked
            if (unit.metadata?.knowledge_unit_id) {
              const knowledgeUnit = await this.findKnowledgeUnit(unit.metadata.knowledge_unit_id);
              if (knowledgeUnit) {
                unitNode.children.push({
                  id: knowledgeUnit.id,
                  type: 'knowledge_unit',
                  content: knowledgeUnit.content,
                  timestamp: knowledgeUnit.created_at,
                  confidence: knowledgeUnit.confidence,
                  metadata: {
                    knowledge_type: knowledgeUnit.knowledge_type,
                    temporal_scope: knowledgeUnit.temporal_scope,
                  },
                  children: [],
                });
              }
            }
          }
        }

        // Find events assembled from this conversation
        const events = await this.findEventsFromConversation(conversationMessage.id, userId);
        for (const event of events) {
          convNode.children.push({
            id: event.id,
            type: 'resolved_event',
            content: event.title || event.summary || 'Event',
            timestamp: event.start_time || event.created_at,
            confidence: event.confidence,
            metadata: {
              summary: event.summary,
              type: event.type,
              people: event.people,
              locations: event.locations,
            },
            children: [],
          });
        }
      }

      // Calculate summary
      const summary = this.calculateSummary(root);
      const tracePath = this.extractTracePath(root);
      const depth = this.calculateDepth(root);

      return {
        root,
        depth,
        totalNodes: this.countNodes(root),
        tracePath,
        summary,
      };
    } catch (error) {
      logger.error({ error, chatMessageId, userId }, 'Failed to trace from chat message');
      return null;
    }
  }

  /**
   * Trace from memory artifact ID (reverse trace)
   * Shows how a memory artifact was created from chat
   */
  async traceFromMemoryArtifact(
    userId: string,
    artifactType: 'perception_entry' | 'journal_entry' | 'insight',
    artifactId: string
  ): Promise<MemoryTrace | null> {
    try {
      let artifact: any;
      let extractedUnitId: string | null = null;

      // Get artifact
      if (artifactType === 'perception_entry') {
        const { data } = await supabaseAdmin
          .from('perception_entries')
          .select('*')
          .eq('id', artifactId)
          .eq('user_id', userId)
          .single();
        artifact = data;
        extractedUnitId = data?.metadata?.extracted_unit_id || null;
      } else if (artifactType === 'journal_entry') {
        const { data } = await supabaseAdmin
          .from('journal_entries')
          .select('*')
          .eq('id', artifactId)
          .eq('user_id', userId)
          .single();
        artifact = data;
        extractedUnitId = data?.metadata?.extracted_unit_id || null;
      } else if (artifactType === 'insight') {
        const { data } = await supabaseAdmin
          .from('insights')
          .select('*')
          .eq('id', artifactId)
          .eq('user_id', userId)
          .single();
        artifact = data;
        extractedUnitId = data?.metadata?.extracted_unit_id || null;
      }

      if (!artifact) {
        return null;
      }

      // Build trace backwards from artifact
      const root: TraceNode = {
        id: artifact.id,
        type: artifactType,
        content: artifact.content || artifact.summary || 'Memory Artifact',
        timestamp: artifact.created_at,
        metadata: artifact.metadata || {},
        confidence: artifact.confidence || artifact.confidence_level,
        children: [],
      };

      // Trace back to extracted unit
      if (extractedUnitId) {
        const unit = await this.findExtractedUnit(extractedUnitId);
        if (unit) {
          const unitNode: TraceNode = {
            id: unit.id,
            type: 'extracted_unit',
            content: unit.content,
            timestamp: unit.created_at,
            confidence: unit.confidence,
            metadata: {
              unit_type: unit.type,
            },
            children: [],
          };
          root.children.push(unitNode);

          // Trace back to utterance
          const utterance = await this.findUtterance(unit.utterance_id);
          if (utterance) {
            const utteranceNode: TraceNode = {
              id: utterance.id,
              type: 'utterance',
              content: utterance.normalized_text,
              timestamp: utterance.created_at,
              children: [],
            };
            unitNode.children.push(utteranceNode);

            // Trace back to conversation message
            const convMessage = await this.findConversationMessageById(utterance.message_id);
            if (convMessage) {
              const convNode: TraceNode = {
                id: convMessage.id,
                type: 'conversation_message',
                content: convMessage.content,
                timestamp: convMessage.created_at,
                children: [],
              };
              utteranceNode.children.push(convNode);

              // Trace back to chat message
              const chatMessageId = convMessage.metadata?.chat_message_id;
              if (chatMessageId) {
                const chatMessage = await this.findChatMessage(chatMessageId, userId);
                if (chatMessage) {
                  convNode.children.push({
                    id: chatMessage.id,
                    type: 'chat_message',
                    content: chatMessage.content,
                    timestamp: chatMessage.created_at,
                    metadata: {
                      role: chatMessage.role,
                      session_id: chatMessage.session_id,
                    },
                    children: [],
                  });
                }
              }
            }
          }
        }
      }

      const summary = this.calculateSummary(root);
      const tracePath = this.extractTracePath(root);
      const depth = this.calculateDepth(root);

      return {
        root,
        depth,
        totalNodes: this.countNodes(root),
        tracePath,
        summary,
      };
    } catch (error) {
      logger.error({ error, artifactType, artifactId, userId }, 'Failed to trace from memory artifact');
      return null;
    }
  }

  /**
   * Trace from extracted unit ID
   * Shows how a semantic unit became memory artifacts
   */
  async traceFromExtractedUnit(
    userId: string,
    unitId: string
  ): Promise<MemoryTrace | null> {
    try {
      const unit = await this.findExtractedUnit(unitId);
      if (!unit || unit.user_id !== userId) {
        return null;
      }

      const root: TraceNode = {
        id: unit.id,
        type: 'extracted_unit',
        content: unit.content,
        timestamp: unit.created_at,
        confidence: unit.confidence,
        metadata: {
          unit_type: unit.type,
          temporal_context: unit.temporal_context,
          entity_ids: unit.entity_ids,
        },
        children: [],
      };

      // Find memory artifacts created from this unit
      await this.attachMemoryArtifacts(root, userId, unit);

      // Trace back to utterance
      const utterance = await this.findUtterance(unit.utterance_id);
      if (utterance) {
        root.children.push({
          id: utterance.id,
          type: 'utterance',
          content: utterance.normalized_text,
          timestamp: utterance.created_at,
          children: [],
        });
      }

      const summary = this.calculateSummary(root);
      const tracePath = this.extractTracePath(root);
      const depth = this.calculateDepth(root);

      return {
        root,
        depth,
        totalNodes: this.countNodes(root),
        tracePath,
        summary,
      };
    } catch (error) {
      logger.error({ error, unitId, userId }, 'Failed to trace from extracted unit');
      return null;
    }
  }

  // ========== Helper Methods ==========

  private async findConversationMessage(chatMessageId: string) {
    const { data } = await supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('metadata->>chat_message_id', chatMessageId)
      .single();
    return data;
  }

  private async findConversationMessageById(messageId: string) {
    const { data } = await supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    return data;
  }

  private async findUtterances(messageId: string) {
    const { data } = await supabaseAdmin
      .from('utterances')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true });
    return data || [];
  }

  private async findUtterance(utteranceId: string) {
    const { data } = await supabaseAdmin
      .from('utterances')
      .select('*')
      .eq('id', utteranceId)
      .single();
    return data;
  }

  private async findExtractedUnits(utteranceId: string) {
    const { data } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('utterance_id', utteranceId)
      .order('created_at', { ascending: true });
    return data || [];
  }

  private async findExtractedUnit(unitId: string) {
    const { data } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('id', unitId)
      .single();
    return data;
  }

  private async findChatMessage(chatMessageId: string, userId: string) {
    const { data } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('id', chatMessageId)
      .eq('user_id', userId)
      .single();
    return data;
  }

  private async findKnowledgeUnit(knowledgeUnitId: string) {
    const { data } = await supabaseAdmin
      .from('knowledge_units')
      .select('*')
      .eq('id', knowledgeUnitId)
      .single();
    return data;
  }

  private async attachMemoryArtifacts(
    unitNode: TraceNode,
    userId: string,
    unit: any
  ): Promise<void> {
    // Find perception entries using JSONB query (more efficient)
    const { data: perceptions } = await supabaseAdmin
      .from('perception_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>extracted_unit_id', unit.id);

    if (perceptions && perceptions.length > 0) {
      for (const perception of perceptions) {
        unitNode.children.push({
          id: perception.id,
          type: 'perception_entry',
          content: perception.content,
          timestamp: perception.created_at,
          confidence: typeof perception.confidence_level === 'number' 
            ? perception.confidence_level 
            : this.parseConfidenceLevel(perception.confidence_level),
          metadata: {
            subject_alias: perception.subject_alias,
            source: perception.source,
            sentiment: perception.sentiment,
          },
          children: [],
        });
      }
    }

    // Find journal entries using JSONB query
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>extracted_unit_id', unit.id);

    if (entries && entries.length > 0) {
      for (const entry of entries) {
        unitNode.children.push({
          id: entry.id,
          type: 'journal_entry',
          content: entry.content,
          timestamp: entry.date || entry.created_at,
          metadata: {
            tags: entry.tags,
            temporal_scope: entry.metadata?.temporal_scope,
            source: entry.source,
          },
          children: [],
        });
      }
    }

    // Find insights using JSONB query
    const { data: insights } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>extracted_unit_id', unit.id);

    if (insights && insights.length > 0) {
      for (const insight of insights) {
        unitNode.children.push({
          id: insight.id,
          type: 'insight',
          content: insight.content,
          timestamp: insight.created_at,
          metadata: {
            category: insight.category,
            intensity: insight.intensity,
          },
          children: [],
        });
      }
    }
  }

  private parseConfidenceLevel(level: string | number | null | undefined): number {
    if (typeof level === 'number') return level;
    if (typeof level === 'string') {
      const map: Record<string, number> = {
        'very_low': 0.2,
        'low': 0.3,
        'medium': 0.5,
        'high': 0.7,
        'very_high': 0.9,
      };
      return map[level] || 0.5;
    }
    return 0.5;
  }

  private async findEventsFromConversation(conversationMessageId: string, userId: string) {
    // Find extracted units from this conversation message
    const { data: utterances } = await supabaseAdmin
      .from('utterances')
      .select('id')
      .eq('message_id', conversationMessageId);

    if (!utterances || utterances.length === 0) {
      return [];
    }

    const utteranceIds = utterances.map(u => u.id);

    // Find units from these utterances
    const { data: units } = await supabaseAdmin
      .from('extracted_units')
      .select('id')
      .in('utterance_id', utteranceIds)
      .eq('type', 'EXPERIENCE');

    if (!units || units.length === 0) {
      return [];
    }

    const unitIds = units.map(u => u.id);

    // Find events that were assembled from these units
    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(20);

    // Filter events that contain any of our unit IDs in their metadata
    const relevantEvents = (events || []).filter(event => {
      const assembledUnits = event.metadata?.assembled_from_units || [];
      return unitIds.some(unitId => assembledUnits.includes(unitId));
    });

    return relevantEvents;
  }

  private calculateSummary(root: TraceNode) {
    const summary = {
      chatMessages: 0,
      utterances: 0,
      extractedUnits: 0,
      memoryArtifacts: 0,
      events: 0,
    };

    const traverse = (node: TraceNode) => {
      if (node.type === 'chat_message') summary.chatMessages++;
      if (node.type === 'utterance') summary.utterances++;
      if (node.type === 'extracted_unit') summary.extractedUnits++;
      if (['perception_entry', 'journal_entry', 'insight'].includes(node.type)) {
        summary.memoryArtifacts++;
      }
      if (node.type === 'resolved_event') summary.events++;

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);
    return summary;
  }

  private extractTracePath(root: TraceNode): string[] {
    const path: string[] = [];
    const traverse = (node: TraceNode) => {
      path.push(node.id);
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(root);
    return path;
  }

  private calculateDepth(root: TraceNode): number {
    if (root.children.length === 0) return 1;
    return 1 + Math.max(...root.children.map(child => this.calculateDepth(child)));
  }

  private countNodes(root: TraceNode): number {
    return 1 + root.children.reduce((sum, child) => sum + this.countNodes(child), 0);
  }
}

export const memoryTraceService = new MemoryTraceService();
