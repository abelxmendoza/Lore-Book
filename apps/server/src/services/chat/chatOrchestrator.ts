import { logger } from '../../logger';
import { config } from '../../config';
import { openai } from '../../lib/openai';
import type OpenAI from 'openai';
import { MemoryRetriever } from './memoryRetriever';
import { MemoryContextBuilder } from './memoryContextBuilder';
import { chatPersona } from './chatPersona';
import { memoryService } from '../memoryService';
import { extractTags, shouldPersistMessage } from '../../utils/keywordDetector';
import type { ChatRequest, ChatResponse, StreamingChatResponse, ChatSource } from './chatTypes';

/**
 * Chat Orchestrator
 * Central logic: merges memory + LLM
 */
export class ChatOrchestrator {
  private retriever: MemoryRetriever;
  private builder: MemoryContextBuilder;

  constructor() {
    this.retriever = new MemoryRetriever();
    this.builder = new MemoryContextBuilder();
  }

  /**
   * Respond to user message with memory context
   */
  async respond(request: ChatRequest): Promise<ChatResponse> {
    try {
      const { userId, message, maxContext = 20, conversationHistory = [] } = request;

      logger.debug({ userId, messageLength: message.length }, 'Processing chat request');

      // 1. Get memory context
      const ctx = await this.retriever.retrieve(userId, maxContext);

      // 2. Build context message
      const systemPrompt = chatPersona + '\n\n';
      const contextBlock = this.builder.build(message, ctx);

      // 3. Build messages array with conversation history
      // Keep last 6 messages to avoid token limits
      const recentHistory = conversationHistory.slice(-6);
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...recentHistory,
        { role: 'user' as const, content: contextBlock },
      ];

      // 4. Send to LLM
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4',
        messages,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';

      logger.debug(
        {
          userId,
          replyLength: reply.length,
          entriesUsed: ctx.entries.length,
          historyLength: recentHistory.length,
        },
        'Chat response generated'
      );

      // 5. Build sources for response
      const sources = this.buildSources(ctx);

      // 6. Auto-save message if it contains important info
      let entryId: string | undefined;
      if (shouldPersistMessage(message)) {
        try {
          const savedEntry = await memoryService.saveEntry({
            userId,
            content: message,
            tags: extractTags(message),
            source: 'chat-memory',
            metadata: {
              autoCaptured: true,
              conversationContext: true,
            },
          });
          entryId = savedEntry.id;
          logger.debug({ userId, entryId }, 'Auto-saved chat message as entry');
        } catch (error) {
          logger.warn({ error, userId }, 'Failed to auto-save chat message');
        }
      }

      return {
        reply,
        usedMemoryIds: ctx.entries.map((e) => e.id || '').filter(Boolean),
        sources,
        entryId,
      };
    } catch (error) {
      logger.error({ error, userId: request.userId }, 'Error in chat orchestrator');
      throw error;
    }
  }

  /**
   * Respond with streaming support
   */
  async respondStream(request: ChatRequest): Promise<StreamingChatResponse> {
    try {
      const { userId, message, maxContext = 20, conversationHistory = [] } = request;

      logger.debug({ userId, messageLength: message.length }, 'Processing streaming chat request');

      // 1. Get memory context
      const ctx = await this.retriever.retrieve(userId, maxContext, message);

      // 2. Build context message
      const systemPrompt = chatPersona + '\n\n';
      const contextBlock = this.builder.build(message, ctx);

      // 3. Build messages array with conversation history
      const recentHistory = conversationHistory.slice(-6);
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...recentHistory,
        { role: 'user' as const, content: contextBlock },
      ];

      // 4. Create streaming response
      const stream = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4',
        messages,
        temperature: 0.7,
        stream: true,
      });

      // 5. Build sources
      const sources = this.buildSources(ctx);

      // 6. Auto-save message if needed (fire and forget)
      let entryId: string | undefined;
      if (shouldPersistMessage(message)) {
        memoryService.saveEntry({
          userId,
          content: message,
          tags: extractTags(message),
          source: 'chat-memory',
          metadata: {
            autoCaptured: true,
            conversationContext: true,
          },
        })
          .then((savedEntry) => {
            entryId = savedEntry.id;
            logger.debug({ userId, entryId }, 'Auto-saved chat message as entry');
          })
          .catch((error) => {
            logger.warn({ error, userId }, 'Failed to auto-save chat message');
          });
      }

      return {
        stream,
        metadata: {
          sources,
          usedMemoryIds: ctx.entries.map((e) => e.id || '').filter(Boolean),
          entryId,
        },
      };
    } catch (error) {
      logger.error({ error, userId: request.userId }, 'Error in streaming chat orchestrator');
      throw error;
    }
  }

  /**
   * Build sources from memory context
   */
  private buildSources(ctx: MemoryContext): ChatSource[] {
    const sources: ChatSource[] = [];

    // Add entry sources
    ctx.entries.slice(0, 10).forEach((entry) => {
      sources.push({
        type: 'entry',
        id: entry.id || '',
        title: entry.date || 'Journal Entry',
        snippet: (entry.content || entry.text || '').slice(0, 100),
        date: entry.date || entry.timestamp,
      });
    });

    // Add engine sources
    if (ctx.identity && Object.keys(ctx.identity).length > 0) {
      sources.push({
        type: 'engine',
        id: 'identity',
        title: 'Identity Core',
        snippet: 'Your core identity profile',
      });
    }

    if (ctx.archetypes && Object.keys(ctx.archetypes).length > 0) {
      sources.push({
        type: 'engine',
        id: 'archetypes',
        title: 'Archetype Profile',
        snippet: 'Your archetypal patterns',
      });
    }

    if (ctx.goals && Array.isArray(ctx.goals) && ctx.goals.length > 0) {
      sources.push({
        type: 'engine',
        id: 'goals',
        title: 'Goals',
        snippet: `${ctx.goals.length} active goals`,
      });
    }

    return sources;
  }
}

