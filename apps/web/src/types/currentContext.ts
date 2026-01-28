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
