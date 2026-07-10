import { useState } from 'react';
import { Bot, User as UserIcon, Copy, Sparkles, ExternalLink, Check, Search, GitFork, CornerDownRight, UserCheck, BookOpen, AlertTriangle } from 'lucide-react';
import { MarkdownRenderer } from '../../../components/chat/MarkdownRenderer';
import { ComposingIndicator } from '../components/ComposingIndicator';
import { parseConnections } from '../../../utils/parseConnections';
import { MemoryCognitionPanel } from '../../../components/chat/MemoryCognitionPanel';
import { CognitionMetaPanel } from '../../../components/chat/CognitionMetaPanel';
import { ModeAttributionBadge } from '../../../components/chat/ModeAttributionBadge';
import { PersonaChip } from './PersonaChip';
import { CreationOutcomePanel } from '../components/CreationOutcomePanel';
import { StaleProjectionPanel } from '../components/StaleProjectionPanel';

const humanizeExpressionMode = (mode: string): string => {
  const modeMap: Record<string, string> = {
    SUPPORTIVE: 'Supportive',
    SOCIAL_FOCUS: 'Social',
    FACTUAL: 'Factual',
    ANALYTICAL: 'Analytical',
    STRATEGIC: 'Strategic',
    MINIMAL: 'Minimal',
  };
  return modeMap[mode] || mode;
};

export type ChatSource = {
  type: 'entry' | 'chapter' | 'character' | 'location' | 'task' | 'hqi' | 'fabric';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

export type ChatSuggestedAction = {
  id: string;
  label: string;
  kind: 'open_sources' | 'search' | 'prefill' | 'fork' | 'navigate' | 'crud_confirm';
  prompt?: string;
  query?: string;
  targetId?: string;
  surface?: 'characters' | 'family' | 'timeline';
  apiMethod?: 'POST' | 'PATCH';
  apiPath?: string;
  apiBody?: Record<string, unknown>;
  successMessage?: string;
};

/** User-facing labels for source types (no jargon like HQI) */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  entry: 'Entry',
  chapter: 'Chapter',
  character: 'Character',
  task: 'Task',
  hqi: 'Smart search',
  fabric: 'Related'
};

import type { RecallChatPayload } from './recallTypes';
import { EntityClarificationChip, type EntityAmbiguity } from './EntityClarificationChip';
import { EntityChipsRow } from './EntityChipsRow';
import { ResponseActionChips } from './ResponseActionChips';
import type { ResponseActionCandidate } from '../../../hooks/useChatStream';
import { RelationshipGroupsRow } from './RelationshipGroupsRow';
import { extractRelationshipGroups } from '../utils/relationshipMetadata';
import { LexicalSignalBadges } from '../../../components/shared/LexicalSignalBadges';
import { extractLexicalSignals } from '../../../lib/lexicalRelationshipLabels';
import { SilenceMessage } from './SilenceMessage';
import { RecallMessage } from './RecallMessage';
import type { EntityMentionRef } from '../../../lib/entityMentions';
import { entityMentionsFromMessage, mergeEntityMentionRefs } from '../../../lib/entityMentions';
import { TextWithEntityPills } from '../../../components/entity/TextWithEntityPills';
import { HowLoreBookUnderstoodThis } from '../../../components/chat/HowLoreBookUnderstoodThis';
import type { LoreEntityKind } from '../../../lib/loreEntities';
import { KnowledgeCorrectionModal } from './KnowledgeCorrectionModal';

export type MessageAttachment = {
  kind: 'image';
  /** Session-only preview (data URL). Prefer `url` after durable storage. */
  dataUrl?: string;
  /** Durable public URL from photos bucket. */
  url?: string;
  storagePath?: string;
  mimeType?: string;
  detail?: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  connections?: string[];
  continuityWarnings?: string[];
  timelineUpdates?: string[];
  strategicGuidance?: string;
  extractedDates?: Array<{ date: string; context: string }>;
  sources?: ChatSource[];
  citations?: Array<{ text: string; sourceId: string; sourceType: string }>;
  isStreaming?: boolean;
  /** Whether this bubble has been confirmed in chat_messages. */
  persistStatus?: 'pending' | 'saved' | 'failed';
  feedback?: 'positive' | 'negative' | null;
  isSystemMessage?: boolean;
  /** Inline vision attachments for this turn (preview + metadata). */
  attachments?: MessageAttachment[];
  metadata?: {
    intent?: string;
    expression_mode?: string;
    why?: string;
    response_mode?: string;
    confidence_label?: string;
    recall_sources?: Message['recall_sources'];
    recall_meta?: Message['recall_meta'];
    disclaimer?: string;
    attachments?: MessageAttachment[];
    /** Extra server fields (ontology, relationship persistence, etc.). */
    [key: string]: unknown;
  };
  // Memory Recall fields
  recall?: RecallChatPayload;
  response_mode?: 'RECALL' | 'SILENCE' | string;
  recall_sources?: Array<{
    entry_id: string;
    timestamp: string;
    summary?: string;
    emotions?: string[];
    themes?: string[];
    entities?: string[];
  }>;
  recall_meta?: {
    persona?: string;
    recall_type?: string;
  };
  confidence_label?: string;
  disclaimer?: string;
  ambiguities?: EntityAmbiguity[];
  disambiguation_prompt?: {
    type: 'ENTITY_CLARIFICATION';
    question_id?: string;
    multi_select?: boolean;
    mention_text: string;
    options: Array<{
      label: string;
      subtitle?: string;
      entity_id: string;
      entity_type: string;
    }>;
    skippable: boolean;
    explanation: string;
  };
  narrativeStory?: import('../../../components/chat/NarrativeStoryPanel').StoryOfSelf;
  narrativeEntryCount?: number;
  modeDecision?: { mode: string; confidence: number; reasoning: string };
  ragStats?: { sourceCount: number; cacheHit: boolean; retrievalMs: number; contextItems: number };
  activePersona?: string;
  cognitionFeedback?: import('../../../hooks/useChatStream').MemoryFeedbackEvent;
  continuityAcknowledged?: { signals: string[]; entityHints: string[]; timelineSignificant: boolean };
  mentionedEntities?: Array<{
    id: string;
    name: string;
    type: 'character' | 'location' | 'organization' | 'skill' | 'event';
    characterVariant?: import('../../../types/certifiedEntity').CharacterVariant;
    loreKind?: LoreEntityKind;
  }>;
  creationOutcomes?: Array<{
    mention: string;
    action: 'create' | 'merge' | 'defer' | 'reject';
    entityId?: string;
    entityName?: string;
    reason?: string;
    candidates?: Array<{ character_id: string; name: string; subtitle?: string }>;
    authority?: 'core' | 'legacy' | 'shadow';
  }>;
  creationOutcomeSummary?: string | null;
  staleProjectionHints?: Array<{
    id: string;
    type: 'biography_snapshot' | 'timeline_event';
    title?: string;
    summary?: string;
  }>;
  staleProjectionSummary?: string | null;
  suggestedActions?: ChatSuggestedAction[];
  /** User-confirmation action chips from the server Response Compiler. */
  actionCandidates?: ResponseActionCandidate[];
  /** First-session "aha": LoreBook recalled something said earlier this session. */
  continuityCallback?: {
    entity: string;
    quote: string;
    priorMessageIndex: number;
    calloutText: string;
  };
};

type ChatMessageProps = {
  message: Message;
  showCognitiveTrace?: boolean;
  animateEnter?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSourceClick?: (source: ChatSource) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  onFork?: () => void;
  onSuggestedAction?: (action: ChatSuggestedAction, message: Message) => void;
  onPrefillComposer?: (prompt: string) => void;
  threadEntityMentions?: EntityMentionRef[];
};

export const ChatMessage = ({
  message,
  showCognitiveTrace = false,
  animateEnter = false,
  onCopy,
  onSourceClick,
  onSuggestedAction,
  onPrefillComposer,
  threadEntityMentions = [],
}: ChatMessageProps) => {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKnowledgeCorrection, setShowKnowledgeCorrection] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);

  const handleCopy = async () => {
    try {
      // Get plain text content (strip markdown if needed)
      const textToCopy = message.content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = message.content;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.();
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const isUser = message.role === 'user';
  const relationshipGroups = extractRelationshipGroups(message.metadata);
  const lexicalSignals = extractLexicalSignals(message.metadata as Record<string, unknown> | undefined);
  const isSystem = message.isSystemMessage;
  const enterClass = animateEnter
    ? isSystem
      ? 'chat-message-enter-system'
      : isUser
        ? 'chat-message-enter-user'
        : 'chat-message-enter-assistant'
    : '';
  const isThinking = !isUser && message.isStreaming && !message.content.trim();
  const inlineEntityMentions = mergeEntityMentionRefs(
    entityMentionsFromMessage(message),
    isUser ? threadEntityMentions : undefined
  );

  // System messages get special styling
  if (isSystem) {
    return (
      <div className={`flex justify-center my-4 w-full ${enterClass}`}>
        <div className="max-w-[48rem] bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg px-4 py-3 border border-primary/30 shadow-lg shadow-primary/5">
          <div className="flex items-center gap-2 text-sm text-white/90">
            <Sparkles className="h-4 w-4 text-primary" />
            <p>{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Memory Recall messages - check both response_mode and metadata
  const responseMode = message.response_mode || message.metadata?.response_mode;
  if (!isUser && (responseMode === 'SILENCE' || responseMode === 'RECALL')) {
    if (responseMode === 'SILENCE') {
      return (
        <div className="flex gap-3 sm:gap-4 w-full mb-4 sm:mb-6 chat-message">
          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <SilenceMessage message={message} />
          </div>
        </div>
      );
    }
    if (responseMode === 'RECALL') {
      return (
        <div className="flex gap-3 sm:gap-4 w-full mb-4 sm:mb-6 chat-message">
          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <RecallMessage message={message} />
          </div>
        </div>
      );
    }
  }

  // Memory Recall messages
  if (!isUser && (message.response_mode === 'SILENCE' || message.response_mode === 'RECALL')) {
    if (message.response_mode === 'SILENCE') {
      return (
        <div className="flex gap-3 sm:gap-4 w-full mb-4 sm:mb-6 chat-message">
          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <SilenceMessage message={message} />
          </div>
        </div>
      );
    }
    if (message.response_mode === 'RECALL') {
      return (
        <div className="flex gap-3 sm:gap-4 w-full mb-4 sm:mb-6 chat-message">
          <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center mt-1">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 w-full">
            <RecallMessage message={message} />
          </div>
        </div>
      );
    }
  }

  return (
    <div
      data-testid={isUser ? 'chat-message-user' : 'chat-message-assistant'}
      className={`flex gap-3 sm:gap-4 lg:gap-6 items-start ${isUser ? 'justify-end' : 'justify-start'} group chat-message w-full mb-4 sm:mb-6 lg:mb-8 ${enterClass}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isUser && (
        <div className={`flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1 ${isThinking ? 'chat-avatar-thinking' : ''}`}>
          <Bot className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary" />
        </div>
      )}
      <div className={`min-w-0 w-full ${isUser ? 'flex flex-col items-end max-w-[92%] sm:max-w-[85%] md:max-w-[75%]' : 'flex-1 flex flex-col'}`}>
        <div
          className={`relative w-full transition-shadow duration-300 ${
            isUser
              ? 'inline-block max-w-full chat-bubble-user rounded-2xl rounded-tr-sm px-4 py-3 sm:px-5 sm:py-4 lg:px-7 lg:py-6 xl:px-8 xl:py-7'
              : `block w-full chat-bubble-assistant rounded-2xl rounded-tl-sm px-4 py-3 sm:px-5 sm:py-4 lg:px-7 lg:py-6 xl:px-8 xl:py-7 ${message.isStreaming ? 'chat-bubble-streaming' : ''}`
          }`}
        >
          {/* Message Actions Menu */}
          {showActions && (onCopy || !isUser) && (
            <div className={`absolute ${isUser ? 'left-0' : 'right-0'} -top-9 sm:-top-10 flex bg-black/80 backdrop-blur-sm rounded-lg p-0.5 sm:p-1 z-10 shadow-xl border border-white/10`}>
              {onCopy && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-white/70 hover:text-white active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation"
                  title={copied ? 'Copied!' : 'Copy message'}
                >
                  <Copy className={`h-3.5 w-3.5 ${copied ? 'text-green-400' : ''}`} />
                </button>
              )}
              {!isUser && (
                <button
                  type="button"
                  onClick={() => setShowKnowledgeCorrection(true)}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-white/70 hover:text-amber-200 active:bg-amber-500/20 hover:bg-amber-500/10 rounded transition-colors touch-manipulation"
                  title={correctionSaved ? 'Correction saved' : 'Correct app knowledge'}
                >
                  {correctionSaved ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
          {/* Strategic Guidance - More subtle */}
          {message.strategicGuidance && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 mb-3">
              <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">{message.strategicGuidance}</p>
            </div>
          )}

          {/* Main Content */}
          <div className="relative group/content">
            {/* Copy button — desktop: floats outside bubble; mobile: sits inside bottom-right */}
            {!isUser && onCopy && (
              <>
                {/* Desktop version: outside the bubble */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="hidden sm:flex absolute -right-10 top-0 h-7 w-7 items-center justify-center rounded-md hover:bg-white/10 active:bg-white/20 text-white/40 hover:text-white transition-all opacity-0 group-hover/content:opacity-100"
                  title={copied ? 'Copied!' : 'Copy response'}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {/* Mobile version: always visible inside bubble */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="sm:hidden absolute bottom-1 right-1 h-7 w-7 flex items-center justify-center rounded-md bg-black/40 text-white/50 active:bg-white/20 transition-all touch-manipulation"
                  title={copied ? 'Copied!' : 'Copy response'}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
            {!isUser ? (
              <div className="w-full min-w-0 prose prose-invert prose-base sm:prose-lg lg:prose-xl max-w-none prose-headings:text-white prose-p:text-white/90 prose-p:leading-relaxed prose-p:my-3 sm:prose-p:my-4 prose-a:text-primary prose-strong:text-white prose-code:text-white prose-pre:bg-black/40">
                {message.isStreaming && !message.content.trim() ? (
                  <ComposingIndicator
                    sourceCount={message.ragStats?.sourceCount}
                    contextItems={message.ragStats?.contextItems}
                    activePersona={message.activePersona}
                    intent={message.metadata?.intent}
                  />
                ) : (
                  <>
                    {message.isStreaming && (
                      <ComposingIndicator
                        compact
                        contentStarted
                        sourceCount={message.ragStats?.sourceCount}
                        contextItems={message.ragStats?.contextItems}
                        activePersona={message.activePersona}
                        intent={message.metadata?.intent}
                      />
                    )}
                    <MarkdownRenderer
                      content={message.content}
                      isStreaming={message.isStreaming}
                      className={message.isStreaming ? 'chat-message-streaming' : ''}
                      entityMentions={inlineEntityMentions}
                    />
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const atts =
                    message.attachments?.length
                      ? message.attachments
                      : Array.isArray(message.metadata?.attachments)
                        ? (message.metadata.attachments as MessageAttachment[])
                        : [];
                  const imageAtts = atts.filter((a) => a.kind === 'image');
                  const withSrc = imageAtts.filter((a) => a.dataUrl || a.url);
                  if (imageAtts.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-2" data-testid="message-image-attachments">
                      {withSrc.map((att, idx) => {
                        const src = att.dataUrl || att.url!;
                        return (
                          <a
                            key={`att-${idx}-${att.storagePath ?? src.slice(0, 24)}`}
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-lg border border-white/15"
                          >
                            <img
                              src={src}
                              alt="Attached"
                              className="max-h-48 max-w-[220px] object-cover"
                            />
                          </a>
                        );
                      })}
                      {withSrc.length === 0 && (
                        <span className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/70">
                          📷 {imageAtts.length === 1 ? 'Image attached' : `${imageAtts.length} images attached`}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const cap = message.content ?? '';
                  const isPlaceholder =
                    !cap ||
                    cap === '[Image attached]' ||
                    /^\[\d+ images attached\]$/.test(cap);
                  // Hide auto vision-enrichment block in the bubble; show user caption only when present.
                  const displayText = cap.includes('[Photo description]:')
                    ? cap.split('[Photo description]:')[0].trim()
                    : cap;
                  if (displayText && !isPlaceholder) {
                    return (
                      <p className="text-base sm:text-lg lg:text-xl text-white whitespace-pre-wrap leading-relaxed sm:leading-loose">
                        <TextWithEntityPills text={displayText} entities={inlineEntityMentions} />
                      </p>
                    );
                  }
                  const hasVisual =
                    message.attachments?.some((a) => a.dataUrl || a.url) ||
                    (Array.isArray(message.metadata?.attachments) &&
                      (message.metadata.attachments as MessageAttachment[]).some((a) => a.url));
                  if (!hasVisual) {
                    return (
                      <p className="text-base sm:text-lg text-white/70 whitespace-pre-wrap">
                        {isPlaceholder ? '📷 Image attached' : cap}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {message.persistStatus === 'failed' && (
              <p
                className="text-[10px] text-red-400/80 mt-1.5"
                data-testid="message-persist-failed"
              >
                Not backed up to cloud — kept in this session. Try sending again or reload.
              </p>
            )}
            {message.persistStatus === 'pending' && !message.isStreaming && (
              <p className="text-[10px] text-white/35 mt-1" data-testid="message-persist-pending">
                Saving…
              </p>
            )}

            {isUser && showCognitiveTrace && (
              <HowLoreBookUnderstoodThis
                messageId={message.id}
                visible={showCognitiveTrace}
                messageContent={message.content}
                mentionedEntities={message.mentionedEntities}
              />
            )}
            
            {/* Inline Citations - ChatGPT style */}
            {message.citations && message.citations.length > 0 && (
              <div className="mt-4 sm:mt-5 lg:mt-6 pt-3 sm:pt-4 border-t border-white/10">
                <div className="text-sm sm:text-base text-white/40 mb-2 sm:mb-3">Sources:</div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {message.citations.map((citation, idx) => (
                    <button
                      key={idx}
                      className="text-sm sm:text-base border border-white/10 text-white/60 bg-white/5 cursor-pointer hover:border-white/20 hover:text-white/80 hover:bg-white/10 transition-all px-3 sm:px-4 py-1.5 sm:py-2 rounded-md"
                      onClick={() => {
                        const source = message.sources?.find(s => s.id === citation.sourceId);
                        if (source && onSourceClick) {
                          onSourceClick(source);
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1 inline" />
                      {citation.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sources - compact inline chips */}
          {message.sources && message.sources.length > 0 && message.citations && message.citations.length > 0 && (
            <div className="pt-2 border-t border-white/8">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-white/30">from</span>
                {message.sources.slice(0, 5).map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSourceClick?.(source)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 bg-white/4 hover:border-white/20 hover:bg-white/8 transition-colors text-xs text-white/50 hover:text-white/80"
                    title={source.title}
                  >
                    <span className="text-white/30">{SOURCE_TYPE_LABELS[source.type] ?? source.type}</span>
                    <span className="truncate max-w-[120px]">{source.title}</span>
                  </button>
                ))}
                {message.sources.length > 5 && (
                  <span className="text-xs text-white/25">+{message.sources.length - 5} more</span>
                )}
              </div>
            </div>
          )}

          {/* Connections - Clickable */}
          {message.connections && message.connections.length > 0 && (
            <div className="pt-4 sm:pt-5 lg:pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white/50" />
                <span className="text-sm sm:text-base font-medium text-white/50">Connections</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.connections.map((conn, idx) => {
                  // Try to parse connection for clickable entities
                  const parsed = parseConnections([conn])[0];
                  
                  if (parsed.type === 'character' && parsed.names) {
                    return (
                      <div key={idx} className="flex flex-wrap gap-1.5">
                        <span className="text-xs text-white/60">{parsed.text}:</span>
                        {parsed.names.map((name, nameIdx) => (
                          <button
                            key={nameIdx}
                            onClick={() => {
                              // Try to find character in sources or navigate
                              const charSource = message.sources?.find(s => 
                                s.type === 'character' && s.title.toLowerCase().includes(name.toLowerCase())
                              );
                              if (charSource && onSourceClick) {
                                onSourceClick(charSource);
                              }
                            }}
                            className="text-xs text-primary/70 hover:text-primary hover:underline cursor-pointer px-1.5 py-0.5 rounded border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  
                  if (parsed.type === 'chapter' && parsed.names) {
                    return (
                      <div key={idx} className="flex flex-wrap gap-1.5">
                        <span className="text-xs text-white/60">{parsed.text}:</span>
                        {parsed.names.map((name, nameIdx) => (
                          <button
                            key={nameIdx}
                            onClick={() => {
                              const chapterSource = message.sources?.find(s => 
                                s.type === 'chapter' && s.title.toLowerCase().includes(name.toLowerCase())
                              );
                              if (chapterSource && onSourceClick) {
                                onSourceClick(chapterSource);
                              }
                            }}
                            className="text-xs text-primary/70 hover:text-primary hover:underline cursor-pointer px-1.5 py-0.5 rounded border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  
                  if (parsed.type === 'location' && parsed.names) {
                    return (
                      <div key={idx} className="flex flex-wrap gap-1.5">
                        <span className="text-xs text-white/60">{parsed.text}:</span>
                        {parsed.names.map((name, nameIdx) => (
                          <button
                            key={nameIdx}
                            onClick={() => {
                              const locationSource = message.sources?.find(s => 
                                s.type === 'location' && s.title.toLowerCase().includes(name.toLowerCase())
                              );
                              if (locationSource && onSourceClick) {
                                onSourceClick(locationSource);
                              }
                            }}
                            className="text-xs text-primary/70 hover:text-primary hover:underline cursor-pointer px-1.5 py-0.5 rounded border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  
                  // Generic connection or HQI/Fabric (show as clickable badge)
                  if (parsed.type === 'hqi' || parsed.type === 'fabric') {
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          // Show sources of this type
                          const relevantSources = message.sources?.filter(s => 
                            s.type === parsed.type || 
                            (parsed.type === 'hqi' && s.type === 'hqi') ||
                            (parsed.type === 'fabric' && s.type === 'fabric')
                          );
                          if (relevantSources && relevantSources.length > 0 && onSourceClick) {
                            onSourceClick(relevantSources[0]);
                          }
                        }}
                        className="text-xs text-primary/70 hover:text-primary hover:underline cursor-pointer px-2 py-1 rounded border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
                      >
                        {parsed.text}
                        <ExternalLink className="h-3 w-3 inline ml-1" />
                      </button>
                    );
                  }
                  
                  // Fallback: plain text
                  return (
                    <p key={idx} className="text-xs text-white/60">
                      {conn}
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* Continuity Warnings */}
          {message.continuityWarnings && message.continuityWarnings.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-yellow-400/80">⚠️ Continuity Check</span>
              </div>
              {message.continuityWarnings.map((warning, idx) => (
                <p key={idx} className="text-xs text-yellow-300/70 ml-4">{warning}</p>
              ))}
            </div>
          )}

          {/* Timeline Updates — header removed; individual items display without the robotic label */}
          {message.timelineUpdates && message.timelineUpdates.length > 0 && (
            <div className="pt-2 space-y-0.5">
              {message.timelineUpdates.map((update, idx) => (
                <p key={idx} className="text-xs text-green-300/60">{update}</p>
              ))}
            </div>
          )}

          {/* Extracted Dates */}
          {message.extractedDates && message.extractedDates.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-blue-400/80">📅 Dates Tracked</span>
              </div>
              {message.extractedDates.map((dateInfo, idx) => (
                <p key={idx} className="text-xs text-blue-300/70 ml-4">
                  {dateInfo.date}: {dateInfo.context}
                </p>
              ))}
            </div>
          )}

          {/* Expression Mode Transparency Footer - More subtle */}
          {!isUser && message.metadata && (
            <div className="mt-3 pt-2 border-t border-white/5">
              <p className="text-xs text-white/30">
                {message.metadata.expression_mode && (
                  <span>Mode: {humanizeExpressionMode(message.metadata.expression_mode)}</span>
                )}
                {message.metadata.why && (
                  <>
                    {message.metadata.expression_mode && <span> · </span>}
                    <span>{message.metadata.why}</span>
                  </>
                )}
              </p>
            </div>
          )}

          {/* Mode attribution — always-visible subtle badge */}
          {!isUser && message.modeDecision && (
            <div className="mt-2">
              <ModeAttributionBadge modeDecision={message.modeDecision} />
            </div>
          )}

          {/* Continuity acknowledgement chip — only show when real entities were captured */}
          {!isUser && message.continuityAcknowledged && message.continuityAcknowledged.entityHints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.continuityAcknowledged.entityHints.slice(0, 3).map((hint, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs text-emerald-400/60 bg-emerald-400/6 border border-emerald-400/12 rounded px-2 py-0.5">
                  ✓ {hint}
                </span>
              ))}
            </div>
          )}

          {/* P1 creation protocol outcomes — durable records started/linked/deferred this turn */}
          {!isUser && message.creationOutcomes && message.creationOutcomes.length > 0 && (
            <CreationOutcomePanel
              messageId={message.id}
              outcomes={message.creationOutcomes}
              summary={message.creationOutcomeSummary}
              onPrefill={onPrefillComposer}
            />
          )}

          {!isUser && message.staleProjectionHints && message.staleProjectionHints.length > 0 && (
            <StaleProjectionPanel
              hints={message.staleProjectionHints}
              summary={message.staleProjectionSummary}
            />
          )}

          {/* Active persona chip — always visible so users know which mode is active */}
          {!isUser && message.activePersona && (
            <PersonaChip persona={message.activePersona} />
          )}

          {/* Cognitive Observability Panels */}
          {!isUser && (
            <CognitionMetaPanel
              modeDecision={message.modeDecision}
              ragStats={message.ragStats}
              activePersona={message.activePersona}
              connections={message.connections}
              visible={showCognitiveTrace}
            />
          )}
          {!isUser && message.cognitionFeedback && (
            <MemoryCognitionPanel feedback={message.cognitionFeedback} />
          )}

          {!isUser && message.suggestedActions && message.suggestedActions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {message.suggestedActions.map((action) => {
                const Icon =
                  action.kind === 'search' ? Search :
                  action.kind === 'fork' ? GitFork :
                  action.kind === 'open_sources' ? ExternalLink :
                  action.kind === 'crud_confirm' ? UserCheck :
                  action.kind === 'navigate' ? BookOpen :
                  CornerDownRight;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onSuggestedAction?.(action, message)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-white"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!isUser && message.continuityCallback && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.07] px-3 py-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 text-xs">
                <div className="text-white/80">{message.continuityCallback.calloutText}</div>
                <div className="mt-0.5 truncate text-white/45" title={message.continuityCallback.quote}>
                  “{message.continuityCallback.quote}”
                </div>
              </div>
            </div>
          )}

          {!isUser && message.actionCandidates && message.actionCandidates.length > 0 && (
            <ResponseActionChips actions={message.actionCandidates} />
          )}

          {/* NarrativeStoryPanel intentionally removed from inline chat.
              Story-of-self analysis lives on the dedicated Story page only. */}
          </div>
        </div>

        {/* Entity chips — below assistant bubble (inside column so flex siblings don't squeeze width) */}
        {!isUser && message.mentionedEntities && message.mentionedEntities.length > 0 && (
          <div className="mt-2 w-full min-w-0">
            <EntityChipsRow entities={message.mentionedEntities} />
          </div>
        )}

        {/* Relationship groups — persisted from ontology pipeline on user turns */}
        {isUser && relationshipGroups.length > 0 && (
          <div className="mt-2 w-full min-w-0">
            <RelationshipGroupsRow groups={relationshipGroups} />
          </div>
        )}

        {isUser && lexicalSignals && (
          <div className="mt-2 w-full min-w-0">
            <LexicalSignalBadges metadata={message.metadata as Record<string, unknown>} />
          </div>
        )}

        {/* Entity Ambiguity Clarification Chips - shown below user messages */}
        {isUser && (message.ambiguities || message.disambiguation_prompt) && (
          <div className="mt-3 space-y-2 w-full min-w-0">
            {message.ambiguities?.map((ambiguity, idx) => (
              <EntityClarificationChip
                key={idx}
                ambiguity={ambiguity}
                messageId={message.id}
              />
            ))}
            {message.disambiguation_prompt && (() => {
              const seen = new Set<string>();
              const candidates = message.disambiguation_prompt.options
                .filter(opt => opt.entity_id && opt.label !== 'Someone else')
                .filter(opt => {
                  if (seen.has(opt.entity_id)) return false;
                  seen.add(opt.entity_id);
                  return true;
                })
                .map(opt => ({
                  entity_id: opt.entity_id,
                  name: opt.label,
                  type: (opt.entity_type || 'CHARACTER') as 'CHARACTER' | 'LOCATION' | 'ORG' | 'PERSON',
                  confidence: 0.8,
                  last_seen: new Date().toISOString(),
                  context_hint: opt.subtitle,
                }));
              if (candidates.length < 2) return null;
              return (
              <EntityClarificationChip
                ambiguity={{
                  surface_text: message.disambiguation_prompt.mention_text,
                  candidates,
                }}
                messageId={message.id}
                hasCreateNewOption={message.disambiguation_prompt.options.some(opt => opt.label === 'Someone else')}
                questionId={message.disambiguation_prompt.question_id}
                multiSelect={message.disambiguation_prompt.multi_select}
              />
              );
            })()}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <UserIcon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary" />
        </div>
      )}
      {showKnowledgeCorrection && (
        <KnowledgeCorrectionModal
          message={message}
          onCancel={() => setShowKnowledgeCorrection(false)}
          onSaved={() => {
            setCorrectionSaved(true);
            window.setTimeout(() => setCorrectionSaved(false), 3000);
          }}
        />
      )}
    </div>
  );
};
