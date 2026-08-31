/**
 * Chat focus — when the user opens main chat from a modal or book section,
 * we carry entity + source context so LoreBook knows what they're focusing on.
 */

export type ChatFocusSourceSurface =
  | 'love'
  | 'characters'
  | 'locations'
  | 'projects'
  | 'organizations'
  | 'skills'
  | 'quests'
  | 'family'
  | 'events'
  | 'perceptions'
  | 'lorebook'
  | 'timeline'
  | 'anchors'
  | 'saga'
  | 'memoir'
  | 'documents'
  | 'photos';

export type ChatFocusEntityType =
  | 'character'
  | 'location'
  | 'organization'
  | 'project'
  | 'skill'
  | 'relationship'
  | 'quest'
  | 'event'
  | 'memory'
  | 'perception'
  | 'document';

export interface ChatDocumentAttachment {
  /** ID of the user_files row; the server re-checks ownership before retrieval. */
  fileId: string;
  fileName: string;
  kind?: string | null;
  resumeDocumentId?: string | null;
}

export const CHAT_DOCUMENT_DRAG_TYPE = 'application/x-lorebook-documents';

export interface ChatFocusSessionStats {
  messagesSent: number;
  connectionDelta: number;
  affectionDelta: number;
  lastUpdatedAt: string;
}

export interface ChatFocusBaseline {
  affectionScore?: number;
  connectionScore?: number;
  healthScore?: number;
}

export interface ChatFocus {
  entityId: string;
  entityName: string;
  entityType: ChatFocusEntityType;
  sourceSurface: ChatFocusSourceSurface;
  sourceLabel: string;
  relationshipId?: string;
  relationshipName?: string;
  knowledgeScope?: string;
  initialPrompt?: string;
  /**
   * When true, main chat auto-sends `initialPrompt` (plus any stashed post-event images)
   * once after the focus arrival handoff.
   */
  autoSubmit?: boolean;
  sessionStats: ChatFocusSessionStats;
  baseline?: ChatFocusBaseline;
  /** Set when navigating modal → chat; drives arrival animations. */
  arrivedAt?: number;
  /**
   * When true (default for modal → chat handoffs), open a fresh empty draft
   * instead of dumping the focus chip into the last sticky mega-thread.
   */
  startNewThread?: boolean;
  /** Documents selected from the library and carried into the focused composer. */
  documentAttachments?: ChatDocumentAttachment[];
  /** Increments on each focused message; drives stat bump animations. */
  statBumpKey?: number;
}

export const CHAT_FOCUS_SOURCE_LABELS: Record<ChatFocusSourceSurface, string> = {
  love: 'Dating & Romance',
  characters: 'Character Book',
  locations: 'Locations',
  projects: 'Projects',
  organizations: 'Groups & Organizations',
  skills: 'Skills',
  quests: 'Quests',
  family: 'Family',
  events: 'Life Log',
  perceptions: 'Perceptions',
  lorebook: 'Lorebooks',
  timeline: 'Omni Timeline',
  anchors: 'Narrative Anchors',
  saga: 'Life Saga',
  memoir: 'LoreBook Editor',
  documents: 'Documents',
  photos: 'Photo Album',
};

export function emptyChatFocusSessionStats(): ChatFocusSessionStats {
  return {
    messagesSent: 0,
    connectionDelta: 0,
    affectionDelta: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function isEmotionalChatMessage(text: string): boolean {
  return /\b(love|feel|feeling|miss|hurt|heart|connection|close|closer|trust|care|affection|intimate|lonely|happy|sad|angry|betray|breakup|together|relationship)\b/i.test(
    text
  );
}

export function computeChatFocusMessageDelta(
  focus: ChatFocus,
  messageLength: number,
  emotional: boolean
): { connectionDelta: number; affectionDelta: number } {
  const base = focus.sourceSurface === 'love' ? 2 : 1;
  const lengthBonus = messageLength > 80 ? 1 : 0;
  const emotionalBonus = emotional ? 2 : 0;
  const connectionDelta = base + lengthBonus + emotionalBonus;
  const affectionDelta = Math.round(connectionDelta * 0.4 * 10) / 10;
  return { connectionDelta, affectionDelta };
}
