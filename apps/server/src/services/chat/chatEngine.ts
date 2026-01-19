import { logger } from '../../logger';

import { ChatOrchestrator } from './chatOrchestrator';
import type { ChatRequest, ChatResponse, StreamingChatResponse } from './chatTypes';

/**
 * Main Chat Engine
 * Entrypoint for AI Memory Chat
 */
export class ChatEngine {
  private orchestrator: ChatOrchestrator;

  constructor() {
    this.orchestrator = new ChatOrchestrator();
  }

  /**
   * Handle chat request (non-streaming)
   */
  async handleChat(request: ChatRequest): Promise<ChatResponse> {
    try {
      logger.debug({ userId: request.userId }, 'Handling chat request');
      return await this.orchestrator.respond(request);
    } catch (error) {
      logger.error({ error, userId: request.userId }, 'Error handling chat');
      throw error;
    }
  }

  /**
   * Handle streaming chat request
   */
  async handleChatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    try {
      logger.debug({ userId: request.userId }, 'Handling streaming chat request');
      return await this.orchestrator.respondStream(request);
    } catch (error) {
      logger.error({ error, userId: request.userId }, 'Error handling streaming chat');
      throw error;
    }
  }
}

