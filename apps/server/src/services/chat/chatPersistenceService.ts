import { randomUUID } from 'crypto';

import { config } from '../../config';
import { logger } from '../../logger';
import { openai } from '../../lib/openai';
import type { MemorySuggestion } from '../omegaChatService';
import { conversationIngestionPipeline } from '../conversationCentered/ingestionPipeline';
import { memoryReviewQueueService } from '../memoryReviewQueueService';
import { omegaMemoryService } from '../omegaMemoryService';
import { perspectiveService } from '../perspectiveService';
import { supabaseAdmin } from '../supabaseClient';

export async function getOrCreateChatSession(userId: string): Promise<string> {
  try {
    const { data: existingSession } = await supabaseAdmin
      .from('chat_sessions')
      .select('session_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const existing = existingSession as any;
    if (existing?.session_id) {
      await supabaseAdmin
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('session_id', existing.session_id);

      if (!existing.session_id) {
        throw new Error('Existing session has no session_id');
      }
      return existing.session_id as string;
    }

    const newSessionId = randomUUID();
    const { data: newSession, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({ user_id: userId, session_id: newSessionId, metadata: {} })
      .select('session_id')
      .single();

    if (error) {
      logger.warn({ error, userId }, 'Failed to create chat session, using temporary ID');
      return randomUUID();
    }

    const ns = newSession as any;
    if (!ns?.session_id) {
      logger.warn({ userId }, 'Created session but no session_id returned, using provided ID');
      return newSessionId;
    }

    return ns.session_id as string;
  } catch (error) {
    logger.warn({ error, userId }, 'Error getting/creating chat session, using temporary ID');
    return randomUUID();
  }
}

export async function detectMemorySuggestion(
  userId: string,
  message: string
): Promise<MemorySuggestion | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: config.defaultModel || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a memory detection system. Determine if the user message contains a factual statement worth remembering.

Return JSON:
{
  "is_memory_worthy": boolean,
  "entity_name": "name of entity (or 'self' for user)",
  "claim_text": "the factual statement to remember",
  "confidence": 0.0-1.0,
  "reasoning": "why this is memory-worthy"
}

Examples of memory-worthy:
- "I'm a software engineer"
- "I live in Seattle"
- "I like coffee"
- "John is my best friend"
- "I work at Google"

Examples of NOT memory-worthy:
- "What do I like?"
- "Tell me about myself"
- "How are you?"
- "Thanks"
- Questions or commands`
        },
        { role: 'user', content: message }
      ]
    });

    const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

    if (!response.is_memory_worthy || !response.entity_name || !response.claim_text) {
      return null;
    }

    const entities = await omegaMemoryService.getEntities(userId);
    let entity = entities.find(e =>
      e.primary_name.toLowerCase() === response.entity_name.toLowerCase() ||
      e.aliases.some((a: string) => a.toLowerCase() === response.entity_name.toLowerCase())
    );

    if (!entity && response.entity_name.toLowerCase() === 'self') {
      entity = entities[0] || null;
    }

    if (!entity) {
      logger.debug({ entityName: response.entity_name }, 'Entity not found for memory suggestion, skipping');
      return null;
    }

    const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
    const selfPerspective = perspectives.find(p => p.type === 'SELF');

    const { proposal } = await memoryReviewQueueService.ingestMemory(
      userId,
      {
        id: '',
        text: response.claim_text,
        confidence: response.confidence || 0.6,
        metadata: {},
      },
      entity,
      selfPerspective?.id || null,
      message
    );

    return {
      proposal_id: proposal.id,
      entity_name: entity.primary_name,
      claim_text: response.claim_text,
      confidence: response.confidence || 0.6,
      source_excerpt: message.length > 200 ? message.substring(0, 200) + '...' : message,
      reasoning: response.reasoning || proposal.reasoning,
      risk_level: proposal.risk_level,
    };
  } catch (error) {
    logger.debug({ err: error, userId, message }, 'Failed to detect memory suggestion');
    return null;
  }
}

export async function ingestMessageWithContext(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  entityContext: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string }
): Promise<void> {
  try {
    const { data: existingSession } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>entity_type', entityContext.type)
      .eq('metadata->>entity_id', entityContext.id)
      .single();

    let sessionId: string;
    if (existingSession) {
      sessionId = (existingSession as any).id as string;
    } else {
      const { data: newSession, error: sessionError } = await supabaseAdmin
        .from('conversation_sessions')
        .insert({
          user_id: userId,
          scope: 'PRIVATE',
          metadata: {
            entity_type: entityContext.type,
            entity_id: entityContext.id,
            is_entity_scoped: true,
          },
        })
        .select('id')
        .single();

      if (sessionError || !newSession) {
        throw sessionError || new Error('Failed to create entity-scoped session');
      }

      sessionId = (newSession as any).id as string;
    }

    await conversationIngestionPipeline.ingestMessage(
      userId,
      sessionId,
      'USER',
      message,
      conversationHistory,
      undefined,
      entityContext as any
    );
  } catch (error) {
    logger.warn({ error, userId, entityContext }, 'Failed to ingest message with entity context');
    throw error;
  }
}
