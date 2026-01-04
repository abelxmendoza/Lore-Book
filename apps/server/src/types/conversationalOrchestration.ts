/**
 * LORE-KEEPER CONVERSATIONAL ORCHESTRATION LAYER (COL)
 * TypeScript Types
 */

export type UserIntent =
  | 'REFLECTION'
  | 'QUESTION'
  | 'CLARIFICATION'
  | 'DECISION_SUPPORT'
  | 'MEMORY_REVIEW';

export type ResponseMode =
  | 'FACTUAL_SUMMARY'
  | 'PERSPECTIVE_SUMMARY'
  | 'INSIGHT_REFLECTION'
  | 'UNCERTAINTY_NOTICE'
  | 'MRQ_PROMPT';

export interface ChatContext {
  id: string;
  user_id: string;
  session_id: string;
  active_entity_ids: string[];
  active_perspective_ids: string[];
  unresolved_mrq_ids: string[];
  recent_insight_ids: string[];
  user_intent?: UserIntent;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  response_mode?: ResponseMode;
  citations?: string[]; // claim_ids that support this response
  confidence?: number;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ChatResponse {
  content: string;
  response_mode: ResponseMode;
  citations?: string[];
  confidence?: number;
  disclaimer?: string;
  related_insights?: string[];
  mrq_proposal_id?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface MessageInput {
  message: string;
  session_id?: string;
}

const MIN_CONFIDENCE = 0.5; // Minimum confidence for factual answers

export { MIN_CONFIDENCE };

