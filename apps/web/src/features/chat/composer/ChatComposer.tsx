import { Send, Loader2, Paperclip, MessageSquare } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerEntityChips } from './ComposerEntityChips';
import { EntityHighlightComposerField } from './EntityHighlightComposerField';
import { ComposerHints } from './ComposerHints';
import { MoodIndicator } from './MoodIndicator';
import { TagSuggestions } from './TagSuggestions';
import { useState, useRef, useEffect } from 'react';
import { useVisualViewportInset } from '../hooks/useVisualViewportInset';
import { DocumentUpload, type UploadCompletePayload } from '../components/DocumentUpload';
import { ChatGPTImport } from '../components/ChatGPTImport';
import { LoreReadinessQuestChips } from '../components/LoreReadinessQuestChips';

import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

type ChatComposerProps = {
  onSubmit: (message: string, certifiedEntities?: CertifiedEntityMatch[]) => void;
  loading: boolean;
  disabled?: boolean;
  onUploadComplete?: (result: UploadCompletePayload) => void;
  initialPrompt?: string | null;
  initialDate?: string | null;
  /** Tighter layout for character/org modals — hides upload chrome, reduces padding */
  variant?: 'default' | 'embedded';
  placeholder?: string;
};

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false,
  onUploadComplete,
  initialPrompt,
  initialDate,
  variant = 'default',
  placeholder = 'Message Lore Book...',
}: ChatComposerProps) => {
  const embedded = variant === 'embedded';
  const {
    input,
    setInput,
    textareaRef,
    showCommandSuggestions,
    commandSuggestions,
    showHints,
    moodColor,
    moodEngine,
    autoTagger,
    entityIndexer,
    visibleMatches,
    confirmingSlots,
    confirmError,
    dismissMatch,
    confirmMatch,
    handleSubmit,
    handleKeyDown,
    insertSuggestion
  } = useChatComposer(onSubmit, initialPrompt);

  // Pre-fill input with initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !input) {
      setInput(initialPrompt);
      // Focus textarea after setting input
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [initialPrompt, input, setInput]);

  const [showUpload, setShowUpload] = useState(false);
  const [showChatGPTImport, setShowChatGPTImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const keyboardInset = useVisualViewportInset(true);

  const isExpanded = isFocused || input.length > 0;

  const handleUploadClick = () => {
    setShowUpload(!showUpload);
    if (showUpload) setShowChatGPTImport(false);
  };

  const handleChatGPTImportClick = () => {
    setShowChatGPTImport(!showChatGPTImport);
    if (showChatGPTImport) setShowUpload(false);
  };

  return (
    <div
      data-testid="chat-composer"
      className={`flex-shrink-0 safe-area-bottom ${
        embedded
          ? 'bg-black/95 backdrop-blur-md'
          : 'border-t border-white/10 bg-black/40 backdrop-blur-sm chat-composer'
      }`}
      style={{ paddingBottom: keyboardInset > 0 ? keyboardInset : undefined }}
    >
      {/* Command Suggestions */}
      {showCommandSuggestions && commandSuggestions.length > 0 && (
        <CommandSuggestions
          suggestions={commandSuggestions}
          onSelect={insertSuggestion}
        />
      )}

      {/* Date Indicator */}
      {initialDate && (
        <div className="px-3 sm:px-4 py-2 border-b border-yellow-500/30 bg-yellow-500/5">
          <div className="px-2 py-1 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded">
            Filling gap from {new Date(initialDate).toLocaleDateString()}
          </div>
        </div>
      )}

      {/* Lore readiness quest chips — fill gaps for upcoming lorebooks */}
      {!embedded && (
        <LoreReadinessQuestChips
          onSelectPrompt={(prompt) => {
            setInput(prompt);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
        />
      )}

      {/* Certified entity chips — detected from book index, load KB into pipeline */}
      {entityIndexer.indexError && (
        <div
          data-testid="composer-index-error"
          className="border-b border-amber-500/15 bg-amber-500/5 px-3 py-0.5 sm:px-4 lg:px-10 xl:px-12"
        >
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 text-[10px] lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
            <span className="truncate text-amber-200/75">{entityIndexer.indexError}</span>
            <button
              type="button"
              data-testid="composer-index-retry"
              className="shrink-0 text-amber-300/90 hover:text-amber-200 underline"
              onClick={() => entityIndexer.retryLoad()}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <ComposerEntityChips
        entities={visibleMatches}
        confirmingSlots={confirmingSlots}
        onDismiss={dismissMatch}
        onConfirm={confirmMatch}
      />

      {confirmError && (
        <div
          data-testid="composer-confirm-error"
          className="border-b border-red-500/15 bg-red-500/5 px-3 py-0.5 sm:px-4 lg:px-10 xl:px-12"
        >
          <p className="mx-auto max-w-5xl truncate text-[10px] text-red-200/85 lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
            {confirmError}
          </p>
        </div>
      )}

      {/* Mood / tags only — entities shown in chip strip above */}
      {showHints && (
        <ComposerHints mood={moodEngine.mood} tagCount={autoTagger.suggestions.length} />
      )}

      {/* Document Upload Section */}
      {showUpload && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[300px] sm:max-h-[350px] overflow-y-auto">
          <DocumentUpload
            compact={true}
            onUploadComplete={async (result) => {
              setShowUpload(false);
              onUploadComplete?.(result);
            }}
            onUploadError={(error) => {
              console.error('Document upload error:', error);
            }}
          />
        </div>
      )}

      {/* ChatGPT Import Section */}
      {showChatGPTImport && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[400px] sm:max-h-[450px] overflow-y-auto">
          <ChatGPTImport
            onImportComplete={async (stats) => {
              setShowChatGPTImport(false);
              console.log('ChatGPT import complete:', stats);
              onUploadComplete?.();
            }}
            onImportError={(error) => {
              console.error('ChatGPT import error:', error);
            }}
          />
        </div>
      )}

      {/* Input Form - ChatGPT style */}
      <form
        onSubmit={handleSubmit}
        className={
          embedded
            ? 'w-full px-2 sm:px-3 py-2'
            : 'mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-4 lg:px-10 xl:px-12 py-2 sm:py-3 lg:py-4 xl:py-5'
        }
      >
        <div className={`flex gap-2 sm:gap-2.5 transition-all duration-200 ${isExpanded ? 'items-end' : 'items-center'}`}>
          {!embedded && (
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={loading || disabled}
              className={`group relative p-1.5 sm:p-2 rounded-lg transition-colors touch-manipulation ${showUpload ? 'bg-primary/20 text-sky-400' : 'text-sky-400/70 hover:text-sky-400 hover:bg-white/10'} ${loading || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Upload documents, photos, resumes"
            >
              <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                Upload documents, photos, resumes
              </span>
            </button>
            <button
              type="button"
              onClick={handleChatGPTImportClick}
              disabled={loading || disabled}
              className={`group relative p-1.5 sm:p-2 rounded-lg transition-colors touch-manipulation ${showChatGPTImport ? 'bg-primary/20 text-yellow-400' : 'text-yellow-400/70 hover:text-yellow-400 hover:bg-white/10'} ${loading || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Import ChatGPT conversation"
            >
              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                Import ChatGPT conversation
              </span>
            </button>
          </div>
          )}

          {/* Textarea + inline entity highlights */}
          <div className="relative flex-1 min-w-0">
          <EntityHighlightComposerField
            value={input}
            onChange={setInput}
            textareaRef={textareaRef}
            matches={visibleMatches}
            placeholder={placeholder}
            disabled={loading || disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => { if (!input.trim()) setIsFocused(false); }}
            onKeyDown={handleKeyDown}
            className={[
              'w-full bg-white/5 border border-white/10 text-white placeholder:text-white/50',
              'resize-none overflow-y-auto text-sm sm:text-base leading-relaxed',
              'focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-primary/20',
              'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent',
              'transition-all duration-200',
              embedded
                ? isExpanded
                  ? 'rounded-xl min-h-[44px] max-h-[160px] sm:max-h-[220px] px-3 py-2.5'
                  : 'rounded-full min-h-[44px] max-h-[120px] px-3 py-2.5 pr-11'
                : isExpanded
                ? 'rounded-2xl min-h-[100px] sm:min-h-[120px] max-h-[320px] sm:max-h-[400px] px-4 sm:px-5 py-3 sm:py-4 pr-4'
                : 'rounded-full min-h-[44px] sm:min-h-[48px] lg:min-h-[52px] max-h-[120px] px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 pr-11 sm:pr-12 lg:pr-14',
            ].join(' ')}
            style={{
              borderColor: showHints ? `${moodColor}66` : undefined,
              boxShadow: showHints ? `0 0 10px ${moodColor}22` : undefined,
            }}
          />
          {isExpanded && input.length > 80 && (
            <div className="absolute bottom-2 right-3 z-[2] text-[10px] text-white/25 tabular-nums pointer-events-none select-none">
              {input.length}
            </div>
          )}
          {showHints && moodEngine.mood.score !== 0 && (
            <MoodIndicator
              color={moodColor}
              label={moodEngine.mood.label}
              position="top-right"
            />
          )}
          </div>

          {/* Send Button - stays at bottom of flex row when expanded */}
          <button
            type="submit"
            disabled={!input.trim() || loading || disabled}
            className={`group relative flex-shrink-0 h-[44px] sm:h-[48px] w-[44px] sm:w-[48px] flex items-center justify-center rounded-full bg-primary/20 hover:bg-primary/30 active:bg-primary/40 border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all touch-manipulation disabled:hover:bg-primary/20 ${loading ? 'chat-loading-avatar-ring scale-95' : ''}`}
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
            ) : (
              <Send className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            )}
            {/* Tooltip */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Send message
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};

