import type { MemoryEntry } from '../../types';

/**
 * Chat Request Interface
 */
export interface ChatRequest {
  userId: string;
  message: string;
  maxContext?: number; // default 20 memories
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Memory Context Interface
 * Contains all engine outputs and relevant memories
 */
export interface MemoryContext {
  entries: MemoryEntry[];
  insights: any;
  identity: any;
  chronology: any;
  relationships: any;
  habits: any;
  goals: any;
  emotionalArcs: any;
  archetypes: any;
  paracosm: any;
  values: any;
  vibes: any; // identity pulse
}

/**
 * Chat Source Interface
 */
export interface ChatSource {
  type: 'entry' | 'engine';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
}

/**
 * Chat Response Interface
 */
export interface ChatResponse {
  reply: string;
  usedMemoryIds: string[];
  sources?: ChatSource[];
  entryId?: string; // If message was auto-saved
}

/**
 * Streaming Chat Response Interface
 */
export interface StreamingChatResponse {
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata: {
    sources?: ChatSource[];
    usedMemoryIds: string[];
    entryId?: string;
  };
}

