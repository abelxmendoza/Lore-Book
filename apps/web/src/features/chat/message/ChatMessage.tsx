import { useState } from 'react';
import { Bot, User as UserIcon, Copy, RotateCw, Edit2, Trash2, Sparkles, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
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
      <div className="flex justify-center my-4">
        <Card className="max-w-[90%] bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-white/90">
              <Sparkles className="h-4 w-4 text-primary" />
              <p>{message.content}</p>
            </div>
          </CardContent>
        </Card>
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
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} group chat-message`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <Card
        className={`max-w-[90%] sm:max-w-[80%] relative ${
          isUser
            ? 'chat-message-user'
            : 'chat-message-assistant'
        }`}
      >
        {/* Message Actions Menu */}
        {showActions && (
          <div className={`absolute ${isUser ? 'left-0' : 'right-0'} -top-8 flex gap-1 bg-black/90 border border-border/60 rounded-lg p-1 z-10 shadow-lg`}>
            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                className="h-7 px-2 text-xs hover:bg-black/60"
                title="Regenerate response"
              >
                <RotateCw className="h-3 w-3" />
              </Button>
            )}
            {onCopy && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2 text-xs hover:bg-black/60"
                title={copied ? 'Copied!' : 'Copy message'}
              >
                <Copy className={`h-3 w-3 ${copied ? 'text-green-400' : ''}`} />
              </Button>
            )}
            {!isUser && onFeedback && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback('positive')}
                  className={`h-7 px-2 text-xs hover:bg-black/60 ${message.feedback === 'positive' ? 'text-green-400' : ''}`}
                  title="Good response"
                >
                  <ThumbsUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback('negative')}
                  className={`h-7 px-2 text-xs hover:bg-black/60 ${message.feedback === 'negative' ? 'text-red-400' : ''}`}
                  title="Poor response"
                >
                  <ThumbsDown className="h-3 w-3" />
                </Button>
              </>
            )}
            {isUser && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-7 px-2 text-xs hover:bg-black/60"
                title="Edit message"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Delete message"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        <CardContent className="p-4 space-y-3">
          {/* Strategic Guidance */}
          {message.strategicGuidance && (
            <div className="p-2 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 mb-2">
              <p className="text-xs text-fuchsia-200 whitespace-pre-wrap">{message.strategicGuidance}</p>
            </div>
          )}

          {/* Main Content */}
          <div className="relative">
            {!isUser ? (
              <MarkdownRenderer 
                content={message.content} 
                isStreaming={message.isStreaming} 
                className={message.isStreaming ? 'chat-message-streaming' : ''}
              />
            ) : (
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                {message.content}
              </p>
            )}
            
            {/* Inline Citations */}
            {message.citations && message.citations.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/20">
                <div className="text-xs text-white/50 mb-1.5">Sources:</div>
                <div className="flex flex-wrap gap-1.5">
                  {message.citations.map((citation, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-xs border-primary/30 text-primary/70 bg-primary/5 cursor-pointer hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-all"
                      onClick={() => {
                        const source = message.sources?.find(s => s.id === citation.sourceId);
                        if (source && onSourceClick) {
                          onSourceClick(source);
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1 inline" />
                      {citation.text}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sources - Clickable Cards */}
          {message.sources && message.sources.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="h-3 w-3 text-primary/70" />
                <span className="text-xs font-semibold text-primary/70">Sources</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.sources.slice(0, 5).map((source, idx) => (
                  <div
                    key={idx}
                    onClick={() => onSourceClick?.(source)}
                    className="px-2 py-1 rounded border border-border/30 bg-black/40 hover:border-primary/50 hover:bg-black/60 cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-primary/70">{source.type}</span>
                      <ExternalLink className="h-2.5 w-2.5 text-primary/50" />
                    </div>
                    <div className="text-white/80 truncate max-w-[120px]" title={source.title}>
                      {source.title}
                    </div>
                    {source.date && (
                      <div className="text-white/40 text-[10px]">
                        {new Date(source.date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connections - Clickable */}
          {message.connections && message.connections.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="h-3 w-3 text-primary/70" />
                <span className="text-xs font-semibold text-primary/70">Connections</span>
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
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-semibold text-yellow-400">⚠️ Continuity Check</span>
              </div>
              {message.continuityWarnings.map((warning, idx) => (
                <p key={idx} className="text-xs text-yellow-300/80 ml-4">{warning}</p>
              ))}
            </div>
          )}

          {/* Timeline Updates */}
          {message.timelineUpdates && message.timelineUpdates.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-semibold text-green-400">✓ Updates</span>
              </div>
              {message.timelineUpdates.map((update, idx) => (
                <p key={idx} className="text-xs text-green-300/80 ml-4">{update}</p>
              ))}
            </div>
          )}

          {/* Extracted Dates */}
          {message.extractedDates && message.extractedDates.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-semibold text-blue-400">📅 Dates Tracked</span>
              </div>
              {message.extractedDates.map((dateInfo, idx) => (
                <p key={idx} className="text-xs text-blue-300/80 ml-4">
                  {dateInfo.date}: {dateInfo.context}
                </p>
              ))}
            </div>
          )}

          <p className="text-xs text-white/40 mt-2">
            {message.timestamp.toLocaleTimeString()}
          </p>

          {/* Expression Mode Transparency Footer */}
          {!isUser && message.metadata && (
            <div className="mt-2 pt-2 border-t border-border/20">
              <p className="text-xs text-white/40">
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
        </CardContent>
      </Card>

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
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <UserIcon className="h-4 w-4 text-primary" />
        </div>
      )}
    </div>
  );
};

