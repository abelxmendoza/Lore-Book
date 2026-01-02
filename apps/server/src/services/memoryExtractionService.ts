import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type {
  ConversationMessage,
  MemoryEntry,
  MemoryComponent,
  ComponentExtractionResult,
  ExtractMemoryInput
} from '../types';
import { conversationService } from './conversationService';
import { memoryService } from './memoryService';
import { ruleBasedMemoryDetectionService } from './ruleBasedMemoryDetection';
import { memoryDetectionCacheService } from './memoryDetectionCacheService';
import { componentExtractionCacheService } from './componentExtractionCacheService';
import { timelineAssignmentService } from './timelineAssignmentService';
import { knowledgeGraphService } from './knowledgeGraphService';
import { llmMemoryExtractionService } from './llmMemoryExtraction';
import { embeddingService } from './embeddingService';
import { supabaseAdmin } from './supabaseClient';

class MemoryExtractionService {
  /**
   * Extract memory from conversation session
   * Summarizes conversation into journal entry and extracts components
   */
  async extractMemory(input: ExtractMemoryInput): Promise<{
    journalEntry: MemoryEntry;
    components: MemoryComponent[];
    timelineLinks: any[];
    extractionConfidence: number;
  }> {
    // Get session with messages
    const sessionData = await conversationService.getSessionWithMessages(
      input.sessionId,
      input.userId
    );

    if (!sessionData) {
      throw new Error('Session not found or access denied');
    }

    const { session, messages } = sessionData;

    // Detect memory-worthy segments using rule-based detection
    const userMessages = messages.filter(m => m.role === 'user');
    const allContent = messages.map(m => m.content).join('\n');

    // Check cache first
    let detection = await memoryDetectionCacheService.getCachedDetection(allContent);
    if (!detection) {
      // Run rule-based detection first (FREE)
      detection = await ruleBasedMemoryDetectionService.detectMemoryWorthy(
        allContent,
        messages.map(m => m.content)
      );

      // If rule-based confidence is low, try LLM fallback
      if (!detection.isMemoryWorthy || detection.confidence < 0.4) {
        logger.debug({ confidence: detection.confidence }, 'Rule-based detection low confidence, trying LLM');
        const llmDetection = await llmMemoryExtractionService.detectMemoryWorthyLLM(messages);
        
        // Use LLM result if it's more confident
        if (llmDetection.confidence > detection.confidence) {
          detection = llmDetection;
        }
      }

      // Cache result
      await memoryDetectionCacheService.cacheDetection(allContent, detection);
    }

    if (!detection.isMemoryWorthy) {
      throw new Error('Conversation does not contain memory-worthy content');
    }

    // Extract memory segments
    const segments = await ruleBasedMemoryDetectionService.extractMemorySegments(messages);
    if (segments.length === 0) {
      throw new Error('No memory segments detected');
    }

    // Use highest confidence segment for journal entry
    const primarySegment = segments[0];

    // Create journal entry from conversation summary
    const entryContent = this.summarizeConversation(messages, primarySegment);
    const entryTags = this.extractTagsFromMessages(messages);

    const journalEntry = await memoryService.saveEntry({
      userId: input.userId,
      content: entryContent,
      tags: entryTags,
      source: 'chat',
      metadata: {
        sessionId: input.sessionId,
        messageCount: messages.length,
        detectionConfidence: detection.confidence,
        detectedPatterns: detection.detectedPatterns,
        extractionMethod: 'rule_based',
      },
    });

    // Extract components from the entry (rule-based for now)
    // Check cache first
    let components: Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[];
    const cachedExtraction = await componentExtractionCacheService.getCachedExtraction(allContent);
    
    if (cachedExtraction) {
      // Use cached components (need to add journal_entry_id)
      components = cachedExtraction.components.map(comp => ({
        ...comp,
        journal_entry_id: journalEntry.id,
      }));
    } else {
      // Extract new components (rule-based first)
      components = await this.extractComponents(journalEntry, messages, detection);
      
      // If rule-based extraction produced few components or low confidence, try LLM
      if (components.length === 0 || detection.confidence < 0.5) {
        logger.debug({ componentCount: components.length, confidence: detection.confidence }, 'Rule-based extraction insufficient, trying LLM');
        try {
          const llmComponents = await llmMemoryExtractionService.extractComponentsLLM(
            entryContent,
            entry.date
          );
          
          // Merge LLM components with rule-based (prefer LLM if available)
          if (llmComponents.length > 0) {
            components = llmComponents.map(comp => ({
              ...comp,
              journal_entry_id: journalEntry.id,
            }));
          }
        } catch (error) {
          logger.warn({ error }, 'LLM component extraction failed, using rule-based');
        }
      }

      // Cache the extraction
      await componentExtractionCacheService.cacheExtraction(allContent, {
        components,
        extractionConfidence: detection.confidence,
      });
    }

    // Save components to database
    const savedComponents = await this.saveComponents(components, journalEntry.id);

    // Assign components to timeline hierarchy
    const timelineLinks = await timelineAssignmentService.batchAssignTimeline(
      savedComponents,
      input.userId
    );

    // Build knowledge graph edges for components
    // Do this in background to avoid blocking
    knowledgeGraphService
      .batchBuildEdges(savedComponents, input.userId)
      .then(edges => {
        logger.info(
          { componentCount: savedComponents.length, edgeCount: edges.length },
          'Knowledge graph edges created'
        );
      })
      .catch(error => {
        logger.error({ error }, 'Failed to build knowledge graph edges');
      });

    return {
      journalEntry,
      components: savedComponents,
      timelineLinks,
      extractionConfidence: detection.confidence,
    };
  }

  /**
   * Summarize conversation into journal entry content
   */
  private summarizeConversation(
    messages: ConversationMessage[],
    primarySegment: { content: string; confidence: number }
  ): string {
    // Simple summarization: combine user messages with context
    const userMessages = messages.filter(m => m.role === 'user');
    const summaries: string[] = [];

    // Extract key points from user messages
    for (const msg of userMessages) {
      const content = msg.content.trim();
      if (content.length > 10) {
        summaries.push(content);
      }
    }

    // Combine into coherent entry
    return summaries.join('\n\n').slice(0, 10000); // Limit length
  }

  /**
   * Extract tags from messages
   */
  private extractTagsFromMessages(messages: ConversationMessage[]): string[] {
    const tags = new Set<string>();
    const allContent = messages.map(m => m.content).join(' ').toLowerCase();

    // Extract hashtags
    const hashtags = allContent.match(/#(\w+)/g);
    if (hashtags) {
      hashtags.forEach(tag => tags.add(tag.slice(1)));
    }

    // Extract common memory-related tags
    const memoryTags = ['conversation', 'chat', 'memory'];
    memoryTags.forEach(tag => tags.add(tag));

    return Array.from(tags).slice(0, 10);
  }

  /**
   * Extract memory components from journal entry
   * Rule-based extraction for now (can be enhanced with LLM later)
   */
  private async extractComponents(
    entry: MemoryEntry,
    messages: ConversationMessage[],
    detection: {
      isMemoryWorthy: boolean;
      confidence: number;
      detectedPatterns: string[];
      reasons: string[];
    }
  ): Promise<Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[]> {
    const components: Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[] = [];
    const content = entry.content;

    // Extract events (past tense verbs)
    const eventPattern = /\b(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished)\b/gi;
    if (eventPattern.test(content)) {
      const eventMatches = content.match(/.{0,200}(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished).{0,200}/gi);
      if (eventMatches && eventMatches.length > 0) {
        components.push({
          journal_entry_id: entry.id,
          component_type: 'event',
          text: eventMatches[0].trim(),
          characters_involved: [],
          location: null,
          timestamp: entry.date,
          tags: [],
          importance_score: Math.min(Math.round(detection.confidence * 10), 10),
          embedding: null,
          metadata: {},
        });
      }
    }

    // Extract thoughts/reflections (emotional or reflective language)
    if (detection.detectedPatterns.includes('emotional_weight')) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'reflection',
        text: content.slice(0, 500),
        characters_involved: [],
        location: null,
        timestamp: entry.date,
        tags: [],
        importance_score: Math.min(Math.round(detection.confidence * 8), 10),
        embedding: null,
        metadata: {},
      });
    }

    // Extract relationship updates
    if (detection.detectedPatterns.includes('relationship')) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'relationship_update',
        text: content.slice(0, 500),
        characters_involved: this.extractCharacterNames(content),
        location: null,
        timestamp: entry.date,
        tags: [],
        importance_score: Math.min(Math.round(detection.confidence * 7), 10),
        embedding: null,
        metadata: {},
      });
    }

    // If no components extracted, create a default one
    if (components.length === 0) {
      components.push({
        journal_entry_id: entry.id,
        component_type: 'thought',
        text: content.slice(0, 1000),
        characters_involved: [],
        location: null,
        timestamp: entry.date,
        tags: [],
        importance_score: Math.min(Math.round(detection.confidence * 5), 10),
        embedding: null,
        metadata: {},
      });
    }

    return components;
  }

  /**
   * Extract character names from content
   */
  private extractCharacterNames(content: string): string[] {
    const names = new Set<string>();
    const capitalizedWords = content.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
    
    if (capitalizedWords) {
      capitalizedWords.forEach(name => {
        if (name.length > 2 && name.length < 50) {
          names.add(name);
        }
      });
    }

    return Array.from(names).slice(0, 10);
  }

  /**
   * Save components to database
   */
  private async saveComponents(
    components: Omit<MemoryComponent, 'id' | 'created_at' | 'updated_at'>[],
    journalEntryId: string
  ): Promise<MemoryComponent[]> {
    const savedComponents: MemoryComponent[] = [];

    for (const component of components) {
      // Generate embeddings for components (reuse embedding service)
      let embedding: number[] | null = null;
      try {
        embedding = await embeddingService.embedText(component.text);
      } catch (error) {
        logger.debug({ error }, 'Failed to generate embedding for component');
      }

      const componentWithId: MemoryComponent = {
        ...component,
        id: uuid(),
        embedding,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from('memory_components')
        .insert(componentWithId);

      if (error) {
        logger.error({ error, componentId: componentWithId.id }, 'Failed to save memory component');
        continue;
      }

      savedComponents.push(componentWithId);
    }

    return savedComponents;
  }
}

export const memoryExtractionService = new MemoryExtractionService();

