import { Send, Loader2, Paperclip, MessageSquare, Maximize2, ChevronDown, ChevronUp, ImagePlus, X } from 'lucide-react';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerEntityChips } from './ComposerEntityChips';
import { EntityHighlightedComposer } from './EntityHighlightedComposer';
import { JournalComposerOverlay } from './JournalComposerOverlay';
import { useEntityCorrectionState } from '../../../hooks/useEntityCorrectionState';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useVisualViewportInset } from '../hooks/useVisualViewportInset';
import { useVisualViewportSize, getComposerStats } from '../hooks/useVisualViewportSize';
import { DocumentUpload, type UploadCompletePayload } from '../components/DocumentUpload';
import { ChatGPTImport } from '../components/ChatGPTImport';
import { LoreReadinessQuestChips } from '../components/LoreReadinessQuestChips';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { cn } from '../../../lib/cn';

import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { persistConfirmedPreviewSpan } from '../../../lib/persistConfirmedPreviewSpan';
import type { ChatImageAttachment } from '../types/chatImageAttachment';

type ChatComposerProps = {
  onSubmit: (
    message: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: CorrectedPreviewSpan[],
    images?: ChatImageAttachment[],
  ) => void;
  loading: boolean;
  disabled?: boolean;
  onUploadComplete?: (result?: UploadCompletePayload) => void;
  initialPrompt?: string | null;
  /** Called once the initialPrompt has been injected, so the source can clear it (one-shot prefill). */
  onInitialPromptApplied?: () => void;
  initialDate?: string | null;
  /** Tighter layout for character/org modals — hides upload chrome, reduces padding */
  variant?: 'default' | 'embedded';
  placeholder?: string;
  threadId?: string;
  /** Mobile: start collapsed to leave room for messages (e.g. when thread has history). */
  defaultCollapsed?: boolean;
  focusCharacterId?: string;
  focusCharacterName?: string;
};

const DEFAULT_PLACEHOLDER = 'Tell your story… names, dates, feelings — dump it all here.';
const EMBEDDED_PLACEHOLDER = 'Message Lore Book…';

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false,
  onUploadComplete,
  initialPrompt,
  onInitialPromptApplied,
  initialDate,
  variant = 'default',
  placeholder,
  threadId,
  defaultCollapsed = false,
  focusCharacterId,
  focusCharacterName,
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
    entityIndexer,
    visibleMatches,
    confirmingSlots,
    includedSlots,
    toggleIncluded,
    confirmError,
    dismissMatch,
    confirmMatch,
    handleSubmit,
    handleKeyDown,
    insertSuggestion,
    setPreviewCorrections,
    pendingImages,
    imageError,
    imageCompressing,
    imageInputRef,
    addPendingImages,
    removePendingImage,
    maxImages,
  } = useChatComposer(onSubmit, initialPrompt, { submitOnEnter: !isMobile, threadId });

  const correction = useEntityCorrectionState(input, threadId, visibleMatches);

  const [showUpload, setShowUpload] = useState(false);
  const [showChatGPTImport, setShowChatGPTImport] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [journalModeOpen, setJournalModeOpen] = useState(false);
  const [mobileCollapsed, setMobileCollapsed] = useState(
    () => isMobile && !embedded && defaultCollapsed
  );

  useEffect(() => {
    if (!isMobile || embedded) return;
    setMobileCollapsed(defaultCollapsed);
    setShowUpload(false);
    setShowChatGPTImport(false);
  }, [threadId, defaultCollapsed, isMobile, embedded]);

  const expandComposer = useCallback(() => {
    setMobileCollapsed(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [textareaRef]);

  const collapseComposer = useCallback(() => {
    setMobileCollapsed(true);
    setShowUpload(false);
    setShowChatGPTImport(false);
    textareaRef.current?.blur();
    setIsFocused(false);
  }, [textareaRef]);

  const submitAndMaybeCollapse = useCallback(
    (e?: React.FormEvent) => {
      handleSubmit(e);
      if (isMobile && !embedded) {
        setMobileCollapsed(true);
        setIsFocused(false);
      }
    },
    [handleSubmit, isMobile, embedded]
  );

  // One-shot prefill: inject a focus/prefill prompt only when it changes to a new
  // value. `input` is intentionally NOT a dependency — previously it was, with a
  // `!input` guard, so clearing the field re-ran this effect and re-injected the
  // prompt on every delete (an endless "it keeps coming back" loop).
  const appliedInitialPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPrompt) {
      appliedInitialPromptRef.current = null;
      return;
    }
    if (appliedInitialPromptRef.current === initialPrompt) return;
    appliedInitialPromptRef.current = initialPrompt;
    setInput(initialPrompt);
    if (isMobile && !embedded) setMobileCollapsed(false);
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 100);
    onInitialPromptApplied?.();
    return () => clearTimeout(focusTimer);
  }, [initialPrompt, setInput, textareaRef, isMobile, embedded, onInitialPromptApplied]);

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
    submitAndMaybeCollapse();
    setJournalModeOpen(false);
  }, [submitAndMaybeCollapse]);

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
      {showCommandSuggestions && commandSuggestions.length > 0 && !(isMobile && mobileCollapsed) && (
        <CommandSuggestions suggestions={commandSuggestions} onSelect={insertSuggestion} />
      )}

      {initialDate && (
        <div className="px-3 sm:px-4 py-2 border-b border-yellow-500/30 bg-yellow-500/5">
          <div className="px-2 py-1 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded">
            Filling gap from {new Date(initialDate).toLocaleDateString()}
          </div>
        </div>
      )}

      {!embedded && !(isMobile && mobileCollapsed) && (
        <LoreReadinessQuestChips
          onSelectPrompt={(prompt) => {
            setInput(prompt);
            if (isMobile) setMobileCollapsed(false);
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

      {showUpload && !(isMobile && mobileCollapsed) && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[300px] sm:max-h-[350px] overflow-y-auto">
          <DocumentUpload
            compact
            focusCharacterId={focusCharacterId}
            focusCharacterName={focusCharacterName}
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

      {showChatGPTImport && !(isMobile && mobileCollapsed) && (
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[400px] sm:max-h-[450px] overflow-y-auto">
          <ChatGPTImport
            onImportComplete={async (importStats) => {
              setShowChatGPTImport(false);
              console.log('ChatGPT import complete:', importStats);
              onUploadComplete?.(undefined);
            }}
            onImportError={(error) => {
              console.error('ChatGPT import error:', error);
            }}
          />
        </div>
      )}

      {isMobile && !embedded && mobileCollapsed && !journalModeOpen && (
        <div className="mx-auto w-full max-w-5xl px-3 py-2 sm:px-4">
          <div className="journal-composer-collapsed">
            <button
              type="button"
              onClick={expandComposer}
              className="journal-composer-collapsed__main"
              aria-label="Expand message composer"
              data-testid="journal-composer-expand-bar"
            >
              <ChevronUp className="journal-composer-collapsed__chevron h-4 w-4 shrink-0" aria-hidden />
              <span className={cn('journal-composer-collapsed__label truncate', input.trim() && 'text-white/85')}>
                {input.trim() ? input : resolvedPlaceholder}
              </span>
            </button>
            {(input.trim() || pendingImages.length > 0) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  submitAndMaybeCollapse();
                }}
                disabled={loading || disabled || imageCompressing}
                className="journal-composer-collapsed__send"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={submitAndMaybeCollapse}
        className={cn(
          embedded
            ? 'w-full px-2 sm:px-3 py-2'
            : 'mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-4 lg:px-10 xl:px-12 py-2.5 sm:py-3',
          journalModeOpen && 'hidden',
          isMobile && !embedded && mobileCollapsed && 'hidden',
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
          <ComposerEntityChips
            variant="inline"
            text={input}
            entities={visibleMatches}
            previewSpans={correction.visibleSpans}
            correctedRecords={correction.correctedRecords}
            confirmingSlots={confirmingSlots}
            includedSlots={includedSlots}
            onToggleIncluded={toggleIncluded}
            scanning={entityIndexer.loading}
            onDismiss={dismissMatch}
            onConfirm={confirmMatch}
            onSelectPreviewSpan={(span) => correction.openSpan(span, 'composer')}
            onConfirmPreviewSpan={(span) => {
              correction.confirmPreviewSpan(span);
              void persistConfirmedPreviewSpan(span, correction.getCorrectedSpan(span));
            }}
            onDismissPreviewSpan={(span) => correction.dismissPreviewSpan(span)}
          />

          {(pendingImages.length > 0 || imageError || imageCompressing) && (
            <div className="flex flex-wrap items-center gap-2 px-1 pb-1" data-testid="composer-image-preview">
              {imageCompressing && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Preparing image…
                </span>
              )}
              {pendingImages.map((img) => (
                <div
                  key={img.id ?? img.dataUrl.slice(0, 32)}
                  className="relative group rounded-lg overflow-hidden border border-white/15 bg-black/40"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.fileName ?? 'Attached'}
                    className="h-16 w-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingImage(img.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/70 p-0.5 text-white/80 hover:text-white"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pendingImages.length > 0 && pendingImages.length < maxImages && (
                <span className="text-[10px] text-white/40">
                  {pendingImages.length}/{maxImages}
                </span>
              )}
              {imageError && (
                <span className="text-[11px] text-red-300/90" data-testid="composer-image-error">
                  {imageError}
                </span>
              )}
            </div>
          )}

          <div className="journal-composer-input-wrap">
            <EntityHighlightedComposer
              value={input}
              onChange={setInput}
              textareaRef={textareaRef}
              matches={visibleMatches}
              threadId={threadId}
              correction={correction}
              onPreviewCorrectionsChange={setPreviewCorrections}
              placeholder={
                pendingImages.length > 0
                  ? 'Ask about this photo… (optional caption)'
                  : resolvedPlaceholder
              }
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
            />
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
            <div className="journal-composer-toolbar__tools">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                data-testid="composer-image-input"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) void addPendingImages(files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || disabled || imageCompressing || pendingImages.length >= maxImages}
                className={cn(
                  'journal-composer-tool',
                  pendingImages.length > 0 && 'journal-composer-tool--active',
                )}
                aria-label="Attach images for vision chat"
                title={`Attach images (up to ${maxImages}) — LoreBook will see them in this message`}
                data-testid="composer-attach-image"
              >
                {imageCompressing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </button>
            {!embedded && (
              <>
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
                    onClick={collapseComposer}
                    disabled={loading || disabled}
                    className="journal-composer-tool sm:hidden"
                    aria-label="Collapse composer"
                    data-testid="journal-composer-collapse"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
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
              </>
            )}
            </div>

            <button
              type="submit"
              disabled={(!input.trim() && pendingImages.length === 0) || loading || disabled || imageCompressing}
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
          threadId={threadId}
          correction={correction}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          loading={loading}
          onSubmit={submitAndCloseJournal}
          onKeyDown={handleKeyDown}
          onPreviewCorrectionsChange={setPreviewCorrections}
          viewportHeight={viewportHeight}
          keyboardInset={keyboardInset}
          confirmingSlots={confirmingSlots}
          includedSlots={includedSlots}
          onToggleIncluded={toggleIncluded}
          onDismiss={dismissMatch}
          onConfirm={confirmMatch}
        />
      )}
    </div>
  );
};
