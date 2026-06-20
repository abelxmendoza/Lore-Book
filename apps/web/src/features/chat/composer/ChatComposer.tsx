import { Send, Loader2, Paperclip, MessageSquare, Maximize2 } from 'lucide-react';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerEntityChips } from './ComposerEntityChips';
import { EntityHighlightedComposer } from './EntityHighlightedComposer';
import { ComposerHints } from './ComposerHints';
import { MoodIndicator } from './MoodIndicator';
import { JournalComposerOverlay } from './JournalComposerOverlay';
import { useState, useEffect, useCallback } from 'react';
import { useVisualViewportInset } from '../hooks/useVisualViewportInset';
import { useVisualViewportSize, getComposerStats } from '../hooks/useVisualViewportSize';
import { DocumentUpload, type UploadCompletePayload } from '../components/DocumentUpload';
import { ChatGPTImport } from '../components/ChatGPTImport';
import { LoreReadinessQuestChips } from '../components/LoreReadinessQuestChips';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { cn } from '../../../lib/cn';

import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';

type ChatComposerProps = {
  onSubmit: (
    message: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: CorrectedPreviewSpan[]
  ) => void;
  loading: boolean;
  disabled?: boolean;
  onUploadComplete?: (result: UploadCompletePayload) => void;
  initialPrompt?: string | null;
  initialDate?: string | null;
  /** Tighter layout for character/org modals — hides upload chrome, reduces padding */
  variant?: 'default' | 'embedded';
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = 'Tell your story… names, dates, feelings — dump it all here.';
const EMBEDDED_PLACEHOLDER = 'Message Lore Book…';

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false,
  onUploadComplete,
  initialPrompt,
  initialDate,
  variant = 'default',
  placeholder,
}: ChatComposerProps) => {
  const embedded = variant === 'embedded';
  const isMobile = useIsMobile();
  const keyboardInset = useVisualViewportInset(true);
  const { height: viewportHeight } = useVisualViewportSize(isMobile);

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
    insertSuggestion,
    setPreviewCorrections,
  } = useChatComposer(onSubmit, initialPrompt, { submitOnEnter: !isMobile });

  useEffect(() => {
    if (initialPrompt && !input) {
      setInput(initialPrompt);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [initialPrompt, input, setInput, textareaRef]);

  const [showUpload, setShowUpload] = useState(false);
  const [showChatGPTImport, setShowChatGPTImport] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [journalModeOpen, setJournalModeOpen] = useState(false);

  const resolvedPlaceholder = placeholder ?? (embedded ? EMBEDDED_PLACEHOLDER : DEFAULT_PLACEHOLDER);
  const stats = getComposerStats(input);
  const showStats = input.length > 0 || isFocused;

  const handleUploadClick = () => {
    setShowUpload(!showUpload);
    if (showUpload) setShowChatGPTImport(false);
  };

  const handleChatGPTImportClick = () => {
    setShowChatGPTImport(!showChatGPTImport);
    if (showChatGPTImport) setShowUpload(false);
  };

  const submitAndCloseJournal = useCallback(() => {
    handleSubmit();
    setJournalModeOpen(false);
  }, [handleSubmit]);

  const openJournalMode = () => {
    setJournalModeOpen(true);
  };

  return (
    <div
      data-testid="chat-composer"
      className={cn(
        'flex-shrink-0 safe-area-bottom journal-composer-root',
        embedded
          ? 'bg-black/95 backdrop-blur-md'
          : 'border-t border-white/10 bg-gradient-to-t from-black/80 via-black/50 to-black/30 backdrop-blur-md chat-composer',
      )}
      style={{ paddingBottom: keyboardInset > 0 && !journalModeOpen ? keyboardInset : undefined }}
    >
      {showCommandSuggestions && commandSuggestions.length > 0 && (
        <CommandSuggestions suggestions={commandSuggestions} onSelect={insertSuggestion} />
      )}

      {initialDate && (
        <div className="px-3 sm:px-4 py-2 border-b border-yellow-500/30 bg-yellow-500/5">
          <div className="px-2 py-1 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded">
            Filling gap from {new Date(initialDate).toLocaleDateString()}
          </div>
        </div>
      )}

      {!embedded && (
        <LoreReadinessQuestChips
          onSelectPrompt={(prompt) => {
            setInput(prompt);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
        />
      )}

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

      {showHints && <ComposerHints mood={moodEngine.mood} tagCount={autoTagger.suggestions.length} />}

      {showUpload && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[300px] sm:max-h-[350px] overflow-y-auto">
          <DocumentUpload
            compact
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

      {showChatGPTImport && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[400px] sm:max-h-[450px] overflow-y-auto">
          <ChatGPTImport
            onImportComplete={async (importStats) => {
              setShowChatGPTImport(false);
              console.log('ChatGPT import complete:', importStats);
              onUploadComplete?.();
            }}
            onImportError={(error) => {
              console.error('ChatGPT import error:', error);
            }}
          />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={cn(
          embedded
            ? 'w-full px-2 sm:px-3 py-2'
            : 'mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-4 lg:px-10 xl:px-12 py-2.5 sm:py-3',
          journalModeOpen && 'hidden',
        )}
      >
        <div
          className={cn(
            'journal-composer-shell',
            embedded && 'journal-composer-shell--embedded',
            isFocused && 'journal-composer-shell--focused',
            isMobile && !embedded && 'journal-composer-shell--mobile',
          )}
        >
          <div className="journal-composer-input-wrap">
            <EntityHighlightedComposer
              value={input}
              onChange={setInput}
              textareaRef={textareaRef}
              matches={visibleMatches}
              onPreviewCorrectionsChange={setPreviewCorrections}
              placeholder={resolvedPlaceholder}
              disabled={loading || disabled}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                if (!input.trim()) setIsFocused(false);
              }}
              onKeyDown={handleKeyDown}
              className={cn(
                'journal-composer-field',
                embedded && 'journal-composer-field--embedded',
              )}
              style={{
                borderColor: showHints ? `${moodColor}66` : undefined,
                boxShadow: showHints ? `0 0 12px ${moodColor}22` : undefined,
              }}
            />
            {showHints && moodEngine.mood.score !== 0 && (
              <MoodIndicator color={moodColor} label={moodEngine.mood.label} position="top-right" />
            )}
          </div>

          {showStats && (
            <div className="journal-composer-meta" aria-live="polite">
              <span>{stats.words} {stats.words === 1 ? 'word' : 'words'}</span>
              <span aria-hidden>·</span>
              <span>{stats.chars} chars</span>
              {stats.paragraphs > 1 && (
                <>
                  <span aria-hidden>·</span>
                  <span>{stats.paragraphs} paragraphs</span>
                </>
              )}
              <span className="journal-composer-meta__hint hidden sm:inline">
                {isMobile ? 'Tap Send when ready' : 'Enter to send · Shift+Enter for new line'}
              </span>
            </div>
          )}

          <div className="journal-composer-toolbar">
            {!embedded && (
              <div className="journal-composer-toolbar__tools">
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={loading || disabled}
                  className={cn(
                    'journal-composer-tool',
                    showUpload && 'journal-composer-tool--active',
                  )}
                  aria-label="Upload documents, photos, resumes"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleChatGPTImportClick}
                  disabled={loading || disabled}
                  className={cn(
                    'journal-composer-tool',
                    showChatGPTImport && 'journal-composer-tool--active',
                  )}
                  aria-label="Import ChatGPT conversation"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
                {isMobile && (
                  <button
                    type="button"
                    onClick={openJournalMode}
                    disabled={loading || disabled}
                    className="journal-composer-tool journal-composer-tool--expand sm:hidden"
                    aria-label="Expand writing space"
                    data-testid="journal-composer-expand"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!input.trim() || loading || disabled}
              className={cn(
                'journal-composer-send',
                isMobile && !embedded && 'journal-composer-send--mobile',
              )}
              aria-label="Send message"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isMobile && !embedded && <span>Send</span>}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {isMobile && !embedded && (
        <JournalComposerOverlay
          open={journalModeOpen}
          onClose={() => setJournalModeOpen(false)}
          value={input}
          onChange={setInput}
          textareaRef={textareaRef}
          matches={visibleMatches}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          loading={loading}
          onSubmit={submitAndCloseJournal}
          onKeyDown={handleKeyDown}
          viewportHeight={viewportHeight}
          keyboardInset={keyboardInset}
          moodColor={moodColor}
          showHints={showHints}
        />
      )}
    </div>
  );
};
