/**
 * Current Context — shared notion of "where the user is"
 * Used by chat, UI, and retrieval. Inferred from navigation only.
 */

export type CurrentContextKind = 'none' | 'timeline' | 'thread';

export type TimelineContextLayer = 'era' | 'saga' | 'arc' | 'chapter';

export interface CurrentContext {
  kind: CurrentContextKind;
  timelineNodeId?: string;
  timelineLayer?: TimelineContextLayer;
  threadId?: string;
}

/**
 * Soul Profile context — optional context when user is on Soul Profile or refining an insight.
 * Sent with chat requests to improve refinement insight resolution.
 */
export interface SoulProfileContext {
  lastReferencedInsightId?: string;
  lastSurfacedInsights?: Array<{
    id: string;
    category: string;
    text: string;
    confidence: number;
  }>;
}
