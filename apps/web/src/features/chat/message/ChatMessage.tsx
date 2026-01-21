import { useState } from 'react';
import { Bot, User as UserIcon, Copy, RotateCw, Edit2, Trash2, Sparkles, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { MarkdownRenderer } from '../../../components/chat/MarkdownRenderer';
import { parseConnections } from '../../../utils/parseConnections';

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
  type: 'entry' | 'chapter' | 'character' | 'task' | 'hqi' | 'fabric';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

import type { RecallChatPayload } from './recallTypes';
import { EntityClarificationChip, type EntityAmbiguity } from './EntityClarificationChip';

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
  feedback?: 'positive' | 'negative' | null;
  isSystemMessage?: boolean;
  metadata?: {
    intent?: string;
    expression_mode?: string;
    why?: string;
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
};

type ChatMessageProps = {
  message: Message;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSourceClick?: (source: ChatSource) => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
};

export const ChatMessage = ({
  message,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  onSourceClick,
  onFeedback
}: ChatMessageProps) => {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  const handleFeedback = (feedback: 'positive' | 'negative') => {
    onFeedback?.(message.id, feedback);
  };

  const isUser = message.role === 'user';
  const isSystem = message.isSystemMessage;

  // System messages get special styling
  if (isSystem) {
    return (
      <div className="flex justify-center my-4 w-full">
        <div className="max-w-[48rem] bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg px-4 py-3 border border-primary/30">
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
      return <SilenceMessage message={message} />;
    }
    if (responseMode === 'RECALL') {
      return <RecallMessage message={message} />;
    }
  }

  // Memory Recall messages
  if (!isUser && (message.response_mode === 'SILENCE' || message.response_mode === 'RECALL')) {
    if (message.response_mode === 'SILENCE') {
      return <SilenceMessage message={message} />;
    }
    if (message.response_mode === 'RECALL') {
      return <RecallMessage message={message} />;
    }
  }

  return (
    <div
      className={`flex gap-3 sm:gap-4 lg:gap-6 ${isUser ? 'justify-end' : 'justify-start'} group chat-message w-full mb-4 sm:mb-6 lg:mb-8`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <Bot className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary" />
        </div>
      )}
      <div className={`flex-1 max-w-full ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`relative inline-block max-w-full ${
            isUser
              ? 'bg-white/10 rounded-2xl rounded-tr-sm px-4 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5'
              : 'bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5'
          }`}
        >
          {/* Message Actions Menu - ChatGPT style */}
          {showActions && (
            <div className={`absolute ${isUser ? 'left-0' : 'right-0'} -top-9 sm:-top-10 flex gap-0.5 sm:gap-1 bg-black/80 backdrop-blur-sm rounded-lg p-0.5 sm:p-1 z-10 shadow-xl border border-white/10`}>
              {!isUser && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-white/70 hover:text-white active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation"
                  title="Regenerate response"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              )}
              {onCopy && (
                <button
                  onClick={handleCopy}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-white/70 hover:text-white active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation"
                  title={copied ? 'Copied!' : 'Copy message'}
                >
                  <Copy className={`h-3.5 w-3.5 ${copied ? 'text-green-400' : ''}`} />
                </button>
              )}
              {!isUser && onFeedback && (
                <>
                  <button
                    onClick={() => handleFeedback('positive')}
                    className={`h-8 sm:h-7 px-2.5 sm:px-2 text-xs active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation ${message.feedback === 'positive' ? 'text-green-400' : 'text-white/70 hover:text-white'}`}
                    title="Good response"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleFeedback('negative')}
                    className={`h-8 sm:h-7 px-2.5 sm:px-2 text-xs active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation ${message.feedback === 'negative' ? 'text-red-400' : 'text-white/70 hover:text-white'}`}
                    title="Poor response"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {isUser && onEdit && (
                <button
                  onClick={onEdit}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-white/70 hover:text-white active:bg-white/20 hover:bg-white/10 rounded transition-colors touch-manipulation"
                  title="Edit message"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="h-8 sm:h-7 px-2.5 sm:px-2 text-xs text-red-400/70 hover:text-red-400 active:bg-red-500/20 hover:bg-red-500/10 rounded transition-colors touch-manipulation"
                  title="Delete message"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
          <div className="relative">
            {!isUser ? (
              <div className="prose prose-invert prose-base sm:prose-lg lg:prose-xl max-w-none prose-headings:text-white prose-p:text-white/90 prose-p:leading-relaxed prose-p:my-3 sm:prose-p:my-4 prose-a:text-primary prose-strong:text-white prose-code:text-white prose-pre:bg-black/40">
                <MarkdownRenderer 
                  content={message.content} 
                  isStreaming={message.isStreaming} 
                  className={message.isStreaming ? 'chat-message-streaming' : ''}
                />
              </div>
            ) : (
              <p className="text-base sm:text-lg lg:text-xl text-white whitespace-pre-wrap leading-relaxed sm:leading-loose">
                {message.content}
              </p>
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

          {/* Sources - Clickable Cards - More subtle ChatGPT style */}
          {message.sources && message.sources.length > 0 && (
            <div className="pt-4 sm:pt-5 lg:pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white/50" />
                <span className="text-sm sm:text-base font-medium text-white/50">Sources</span>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {message.sources.slice(0, 5).map((source, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSourceClick?.(source)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-md border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 cursor-pointer transition-colors text-sm sm:text-base text-white/70 hover:text-white"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-white/60">{source.type}</span>
                      <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 text-white/40" />
                    </div>
                    <div className="text-white/90 truncate max-w-[150px] sm:max-w-[200px]" title={source.title}>
                      {source.title}
                    </div>
                    {source.date && (
                      <div className="text-white/40 text-xs sm:text-sm">
                        {new Date(source.date).toLocaleDateString()}
                      </div>
                    )}
                  </button>
                ))}
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

          {/* Timeline Updates */}
          {message.timelineUpdates && message.timelineUpdates.length > 0 && (
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-green-400/80">✓ Updates</span>
              </div>
              {message.timelineUpdates.map((update, idx) => (
                <p key={idx} className="text-xs text-green-300/70 ml-4">{update}</p>
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
          </div>
        </div>
      </div>

      {/* Entity Ambiguity Clarification Chips - shown below user messages */}
      {isUser && (message.ambiguities || message.disambiguation_prompt) && (
        <div className="mt-3 space-y-2">
          {message.ambiguities?.map((ambiguity, idx) => (
            <EntityClarificationChip
              key={idx}
              ambiguity={ambiguity}
              messageId={message.id}
            />
          ))}
          {message.disambiguation_prompt && (
            <EntityClarificationChip
              ambiguity={{
                surface_text: message.disambiguation_prompt.mention_text,
                candidates: message.disambiguation_prompt.options
                  .filter(opt => opt.entity_id && opt.label !== 'Someone else') // Filter out "Someone else" option
                  .map(opt => ({
                    entity_id: opt.entity_id,
                    name: opt.label,
                    type: (opt.entity_type || 'CHARACTER') as 'CHARACTER' | 'LOCATION' | 'ORG' | 'PERSON',
                    confidence: 0.8,
                    last_seen: new Date().toISOString(),
                    context_hint: opt.subtitle,
                  })),
              }}
              messageId={message.id}
              hasCreateNewOption={message.disambiguation_prompt.options.some(opt => opt.label === 'Someone else')}
            />
          )}
        </div>
      )}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <UserIcon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-primary" />
        </div>
      )}
    </div>
  );
};

