import { useState, useRef, useEffect, useCallback } from 'react';

import { useAutoTagger } from '../../../hooks/useAutoTagger';
import { useEntityIndexer } from '../../../hooks/useEntityIndexer';
import { useMoodEngine, localHeuristic } from '../../../hooks/useMoodEngine';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import { confirmComposerEntity } from '../../../lib/confirmComposerEntity';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import {
  openCharacterBookModal,
  openLocationBookModal,
  openOrganizationBookModal,
  openProjectBookModal,
  openSkillBookModal,
} from '../../../lib/skillEntityNavigation';
import { useAppDispatch, useAppSelector, useAppStore } from '../../../store/hooks';
import { selectVisibleComposerMatches, selectComposerConfirmingSlots, selectComposerIncludedSlots } from '../../../store/selectors/composerSelectors';
import {
  clearComposerState,
  dismissComposerMatch,
  setComposerHasDraft,
  composerMatchSlot,
  addComposerConfirming,
  removeComposerConfirming,
  toggleComposerIncluded,
} from '../../../store/slices/composerSlice';
import { getCommandSuggestions } from '../../../utils/slashCommands';
import {
  compressChatImages,
  MAX_CHAT_IMAGES_PER_TURN,
  type ChatImageAttachment,
} from '../types/chatImageAttachment';
import { useAuth } from '../../../lib/supabase';
import { demoThreadStorageUserId, isDemoRuntimeActive } from '../../../lib/demoRuntime';
import {
  latestRecoverableStory,
  readComposerDraft,
  saveComposerDraft,
  scheduleComposerDraftSave,
  flushComposerDraftSave,
  subscribeStoryRecovery,
} from '../services/storySafetyVault';
import {
  COMPOSER_LIGHTWEIGHT_PREVIEW_MS,
  composerIntelligenceMetrics,
  noteRawComposerDraft,
} from '../../../lib/composerIntelligence';

type UseChatComposerOptions = {
  /** Desktop default: Enter sends, Shift+Enter newline. Mobile should pass false. */
  submitOnEnter?: boolean;
  threadId?: string;
};

function openConfirmedComposerEntity(result: Awaited<ReturnType<typeof confirmComposerEntity>>): void {
  if (!result?.id) return;
  switch (result.type) {
    case 'character':
      openCharacterBookModal({ characterId: result.id, tab: 'info' });
      break;
    case 'location':
      openLocationBookModal(result.id);
      break;
    case 'organization':
      openOrganizationBookModal(result.id);
      break;
    case 'skill':
      openSkillBookModal(result.id);
      break;
    case 'project':
      openProjectBookModal(result.id);
      break;
    default:
      break;
  }
}

export const useChatComposer = (
  onSubmit: (
    message: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: CorrectedPreviewSpan[],
    images?: ChatImageAttachment[],
  ) => void,
  initialValue?: string | null,
  options: UseChatComposerOptions = {},
) => {
  const { submitOnEnter = true, threadId } = options;
  const { user } = useAuth();
  // Public /demo must never read/write drafts under the authenticated user id —
  // that is how private unsent lore leaked into the showcase composer.
  const draftOwnerId = isDemoRuntimeActive()
    ? demoThreadStorageUserId()
    : (user?.id ?? 'guest-or-anonymous');
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const visibleMatches = useAppSelector(selectVisibleComposerMatches);
  const confirmingSlots = useAppSelector(selectComposerConfirmingSlots);
  const includedSlots = useAppSelector(selectComposerIncludedSlots);
  const [input, setInputState] = useState(
    () => initialValue || readComposerDraft(draftOwnerId, threadId) || latestRecoverableStory(draftOwnerId, threadId)?.text || ''
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [previewCorrections, setPreviewCorrections] = useState<CorrectedPreviewSpan[]>([]);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<Array<{ command: string; description: string }>>([]);
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageCompressing, setImageCompressing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const hasDraftRef = useRef(false);
  /**
   * After an intentional submit we must keep the composer empty even if:
   * - threadId changes while the send is still in-flight, or
   * - a vault attempt still exists until durable persistence clears it.
   * Explicit failure recovery (requestStoryRecovery) clears this flag.
   */
  const skipVaultAutoRestoreRef = useRef(false);
  
  const moodEngine = useMoodEngine();
  const autoTagger = useAutoTagger();
  const entityIndexer = useEntityIndexer();

  const syncOccupancy = useCallback(
    (value: string) => {
      const has = Boolean(value.trim());
      if (has === hasDraftRef.current) return;
      hasDraftRef.current = has;
      composerIntelligenceMetrics.noteReduxOccupancySync();
      dispatch(setComposerHasDraft(has));
    },
    [dispatch],
  );

  useEffect(() => {
    noteRawComposerDraft(inputRef.current);
    syncOccupancy(inputRef.current);
  }, [syncOccupancy]);

  const setInput = useCallback(
    (value: string) => {
      composerIntelligenceMetrics.noteKeystroke();
      setInputState(value);
      inputRef.current = value;
      scheduleComposerDraftSave(draftOwnerId, threadId, value);
      syncOccupancy(value);
    },
    [draftOwnerId, syncOccupancy, threadId]
  );

  // Restore unsent drafts on thread switch / remount.
  // Vault attempts restore only on reload (when we did not just submit) or via
  // subscribeStoryRecovery after a failed send — never after a successful submit.
  useEffect(() => {
    const draft = readComposerDraft(draftOwnerId, threadId);
    const vaultText = skipVaultAutoRestoreRef.current
      ? ''
      : latestRecoverableStory(draftOwnerId, threadId)?.text || '';
    const recovered = draft || vaultText || '';
    if (recovered && !input) {
      setInputState(recovered);
      noteRawComposerDraft(recovered);
      syncOccupancy(recovered);
    }
    return subscribeStoryRecovery((attempt) => {
      if (attempt.ownerId !== draftOwnerId || attempt.threadId !== threadId) return;
      skipVaultAutoRestoreRef.current = false;
      setInputState(attempt.text);
      saveComposerDraft(draftOwnerId, threadId, attempt.text);
      noteRawComposerDraft(attempt.text);
      syncOccupancy(attempt.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }, [dispatch, draftOwnerId, threadId, syncOccupancy]); // input intentionally checked only when the owner/thread changes

  useEffect(() => {
    return () => {
      flushComposerDraftSave(draftOwnerId, threadId, inputRef.current);
    };
  }, [draftOwnerId, threadId]);

  // Lightweight assistance is delayed. Slash commands stay immediate (tiny, prefix-only).
  useEffect(() => {
    if (input.startsWith('/')) {
      const suggestions = getCommandSuggestions(input);
      setCommandSuggestions(suggestions);
      setShowCommandSuggestions(suggestions.length > 0);
    } else {
      setShowCommandSuggestions(false);
    }

    if (!input.trim()) {
      moodEngine.setScore(0);
      autoTagger.refreshSuggestions('');
      entityIndexer.analyze('');
      return;
    }

    entityIndexer.analyze(input, threadId, 'keystroke');
    const timer = window.setTimeout(() => {
      autoTagger.refreshSuggestions(input);
      moodEngine.setScore(localHeuristic(input));
    }, COMPOSER_LIGHTWEIGHT_PREVIEW_MS);
    return () => window.clearTimeout(timer);
  }, [input, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPendingImages = useCallback(async (files: FileList | File[]) => {
    setImageError(null);
    setImageCompressing(true);
    try {
      const existing = pendingImages.length;
      const { images, error } = await compressChatImages(files, existing);
      if (error) setImageError(error);
      if (images.length > 0) {
        setPendingImages((prev) => [...prev, ...images].slice(0, MAX_CHAT_IMAGES_PER_TURN));
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not attach image');
    } finally {
      setImageCompressing(false);
    }
  }, [pendingImages.length]);

  const addPendingImage = useCallback(
    async (file: File) => addPendingImages([file]),
    [addPendingImages],
  );

  const removePendingImage = useCallback((id?: string) => {
    setPendingImages((prev) => (id ? prev.filter((img) => img.id !== id) : []));
    setImageError(null);
  }, []);

  const clearPendingImages = useCallback(() => {
    setPendingImages([]);
    setImageError(null);
  }, []);

  const seedPendingImages = useCallback((images: ChatImageAttachment[]) => {
    setPendingImages(images.slice(0, MAX_CHAT_IMAGES_PER_TURN));
    setImageError(null);
  }, []);

  const handleSubmit = useCallback((e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text && pendingImages.length === 0) return;

    flushComposerDraftSave(draftOwnerId, threadId, overrideText ?? input);
    if (typeof entityIndexer.flushNow === 'function') {
      entityIndexer.flushNow(text, threadId);
    }
    const composerState = store.getState();
    const includedNow = selectComposerIncludedSlots(composerState);
    const visibleNow = selectVisibleComposerMatches(composerState);
    const entitiesToSend = visibleNow.filter(
      (m) =>
        includedNow.includes(composerMatchSlot(m)) &&
        m.status !== 'draft' &&
        m.composerChipKind !== 'needs_clarification' &&
        m.composerChipKind !== 'relationship' &&
        m.composerChipKind !== 'shared_history',
    );
    const imagesToSend = pendingImages.length > 0 ? pendingImages : undefined;
    skipVaultAutoRestoreRef.current = true;
    onSubmit(text, entitiesToSend, previewCorrections, imagesToSend);
    dispatch(clearComposerState());
    hasDraftRef.current = false;
    if (overrideText === undefined || overrideText === input) {
      setInput('');
    } else {
      scheduleComposerDraftSave(draftOwnerId, threadId, input);
      syncOccupancy(input);
    }
    setPreviewCorrections([]);
    setPendingImages([]);
    setImageError(null);
  }, [input, pendingImages, onSubmit, previewCorrections, setInput, dispatch, draftOwnerId, threadId, entityIndexer, syncOccupancy, store]);

  const dismissMatch = useCallback(
    (match: CertifiedEntityMatch) => {
      dispatch(dismissComposerMatch(composerMatchSlot(match)));
    },
    [dispatch]
  );

  const confirmMatch = useCallback(
    async (match: CertifiedEntityMatch) => {
      if (match.lifecycleStatus !== 'archived' && (match.status === 'confirmed' || !match.status)) return;
      const slot = composerMatchSlot(match);
      dispatch(addComposerConfirming(slot));
      setConfirmError(null);
      try {
        const confirmed = await confirmComposerEntity(match);
        entityIndexer.retryLoad();
        entityIndexer.analyze(input, threadId, 'lightweight');
        openConfirmedComposerEntity(confirmed);
      } catch (error) {
        setConfirmError(error instanceof Error ? error.message : 'Could not confirm entity');
      } finally {
        dispatch(removeComposerConfirming(slot));
      }
    },
    [dispatch, entityIndexer, input, threadId]
  );

  const handleComposerBlur = useCallback(() => {
    const value = inputRef.current;
    flushComposerDraftSave(draftOwnerId, threadId, value);
    if (value.trim() && typeof entityIndexer.requestAuthoritativePreview === 'function') {
      entityIndexer.requestAuthoritativePreview(value, threadId);
    }
  }, [draftOwnerId, entityIndexer, threadId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!submitOnEnter) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, submitOnEnter]);

  const insertSuggestion = useCallback((command: string) => {
    setInput(`${command} `);
    setShowCommandSuggestions(false);
    textareaRef.current?.focus();
  }, [setInput]);

  const toggleIncluded = useCallback(
    (slot: string) => {
      dispatch(toggleComposerIncluded(slot as import('../../../store/slices/composerSlice').ComposerMatchSlot));
    },
    [dispatch],
  );

  const showHints = input.trim().length > 10;
  const moodColor = moodEngine.mood.color;

  return {
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
    includedSlots,
    toggleIncluded,
    confirmError,
    dismissMatch,
    confirmMatch,
    handleSubmit,
    handleComposerBlur,
    handleKeyDown,
    insertSuggestion,
    previewCorrections,
    setPreviewCorrections,
    pendingImages,
    imageError,
    imageCompressing,
    imageInputRef,
    addPendingImage,
    addPendingImages,
    removePendingImage,
    clearPendingImages,
    seedPendingImages,
    maxImages: MAX_CHAT_IMAGES_PER_TURN,
  };
};
