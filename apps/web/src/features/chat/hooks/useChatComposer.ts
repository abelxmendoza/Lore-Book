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
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectVisibleComposerMatches, selectComposerConfirmingSlots, selectComposerIncludedSlots } from '../../../store/selectors/composerSelectors';
import {
  clearComposerState,
  dismissComposerMatch,
  setComposerDraft,
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
  subscribeStoryRecovery,
} from '../services/storySafetyVault';
import {
  composerIntelligenceMetrics,
  noteRawComposerDraft,
} from '../../../lib/composerIntelligence';

type UseChatComposerOptions = {
  /** Desktop default: Enter sends, Shift+Enter newline. Mobile should pass false. */
  submitOnEnter?: boolean;
  threadId?: string;
};

export const COMPOSER_DRAFT_PERSIST_DEBOUNCE_MS = 600;
export const COMPOSER_LOCAL_IDLE_DEBOUNCE_MS = 200;

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
  /**
   * After an intentional submit we must keep the composer empty even if:
   * - threadId changes while the send is still in-flight, or
   * - a vault attempt still exists until durable persistence clears it.
   * Explicit failure recovery (requestStoryRecovery) clears this flag.
   */
  const skipVaultAutoRestoreRef = useRef(false);
  const hasDraftRef = useRef(Boolean(input.trim()));
  
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

  // Draft persistence (localStorage write + Redux mirror) is expensive to run
  // synchronously on every keystroke — see storySafetyVault.saveComposerDraft.
  // Typing updates local `input` state immediately (for the textarea itself
  // and for Send, which always reads `input` directly — never this mirror);
  // the persisted copies trail on a short idle debounce and are flushed
  // immediately on blur/send/unmount so draft recovery never loses text.
  const DRAFT_PERSIST_DEBOUNCE_MS = COMPOSER_DRAFT_PERSIST_DEBOUNCE_MS;
  const draftPersistTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef(input);
  const draftPersistKeyRef = useRef({ draftOwnerId, threadId });
  draftPersistKeyRef.current = { draftOwnerId, threadId };

  useEffect(() => {
    noteRawComposerDraft(latestDraftRef.current);
    syncOccupancy(latestDraftRef.current);
  }, [syncOccupancy]);

  const flushDraftPersist = useCallback((value: string) => {
    if (draftPersistTimerRef.current) {
      window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }
    const { draftOwnerId: ownerId, threadId: tid } = draftPersistKeyRef.current;
    saveComposerDraft(ownerId, tid, value);
    dispatch(setComposerDraft(value));
  }, [dispatch]);

  const setInput = useCallback(
    (value: string) => {
      composerIntelligenceMetrics.noteKeystroke();
      noteRawComposerDraft(value);
      setInputState(value);
      latestDraftRef.current = value;
      syncOccupancy(value);
      // Clearing (send, discard) is correctness-sensitive — persist immediately
      // so a stale non-empty draft can never reappear from a pending timer.
      if (!value.trim()) {
        flushDraftPersist(value);
        return;
      }
      if (draftPersistTimerRef.current) window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = window.setTimeout(() => {
        draftPersistTimerRef.current = null;
        flushDraftPersist(value);
      }, DRAFT_PERSIST_DEBOUNCE_MS);
    },
    [flushDraftPersist, syncOccupancy]
  );

  // Blur / unmount: best-effort flush so navigating away or losing focus never
  // drops the last few debounced-but-unpersisted characters.
  const handleComposerBlur = useCallback(() => {
    if (draftPersistTimerRef.current) flushDraftPersist(latestDraftRef.current);
    const value = latestDraftRef.current;
    if (value.trim() && typeof entityIndexer.requestAuthoritativePreview === 'function') {
      entityIndexer.requestAuthoritativePreview(value, threadId);
    }
  }, [entityIndexer, flushDraftPersist, threadId]);

  useEffect(() => {
    return () => {
      if (draftPersistTimerRef.current) flushDraftPersist(latestDraftRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      latestDraftRef.current = recovered;
      dispatch(setComposerDraft(recovered));
      noteRawComposerDraft(recovered);
      syncOccupancy(recovered);
    }
    return subscribeStoryRecovery((attempt) => {
      if (attempt.ownerId !== draftOwnerId || attempt.threadId !== threadId) return;
      skipVaultAutoRestoreRef.current = false;
      setInputState(attempt.text);
      latestDraftRef.current = attempt.text;
      saveComposerDraft(draftOwnerId, threadId, attempt.text);
      dispatch(setComposerDraft(attempt.text));
      noteRawComposerDraft(attempt.text);
      syncOccupancy(attempt.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }, [dispatch, draftOwnerId, threadId, syncOccupancy]); // input intentionally checked only when the owner/thread changes

  // Slash-command detection and clear-on-empty are cheap and expected to
  // react instantly — these stay on the immediate path, unlike the entity
  // matching / mood / autotag pipeline below.
  useEffect(() => {
    if (typeof entityIndexer.primeDraft === 'function') {
      entityIndexer.primeDraft(input, threadId);
    }
    if (typeof entityIndexer.abortInFlightPreview === 'function') {
      entityIndexer.abortInFlightPreview();
    }
    if (!input.trim()) {
      moodEngine.setScore(0);
      autoTagger.refreshSuggestions('');
      entityIndexer.analyze('');
      setShowCommandSuggestions(false);
      return;
    }
    if (input.startsWith('/')) {
      const suggestions = getCommandSuggestions(input);
      setCommandSuggestions(suggestions);
      setShowCommandSuggestions(suggestions.length > 0);
    } else {
      setShowCommandSuggestions(false);
    }
  }, [input, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Composer intelligence (entity matching, autotag, mood) is expensive
  // (certified-entity regex scanning, draft-name detection, lexical parsing,
  // promotion scoring — see certifiedEntityMatch.ts) and must trail typing
  // rather than run on every keystroke. This is the "LOCAL CHIP IDLE" tier —
  // deliberately a separate, shorter timer than the remote preview debounce
  // inside entityIndexer.analyze (that one schedules its own longer-delayed
  // server fetch independently once this fires).
  const localIdleTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!input.trim()) return; // handled immediately above
    if (localIdleTimerRef.current) window.clearTimeout(localIdleTimerRef.current);
    localIdleTimerRef.current = window.setTimeout(() => {
      localIdleTimerRef.current = null;
      autoTagger.refreshSuggestions(input);
      entityIndexer.analyze(input, threadId, 'lightweight');
      moodEngine.setScore(localHeuristic(input));
    }, COMPOSER_LOCAL_IDLE_DEBOUNCE_MS);
    return () => {
      if (localIdleTimerRef.current) {
        window.clearTimeout(localIdleTimerRef.current);
        localIdleTimerRef.current = null;
      }
    };
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
    // overrideText lets a caller (auto-submit) send a specific captured string
    // instead of whatever the live textarea currently holds — see ChatComposer's
    // auto-submit effect for why this matters: without it, a fast follow-up
    // typed during the auto-submit delay gets folded into the same message.
    const text = (overrideText ?? input).trim();
    if (!text && pendingImages.length === 0) return;

    const entitiesToSend = visibleMatches.filter(
      (m) =>
        includedSlots.includes(composerMatchSlot(m)) &&
        m.status !== 'draft' &&
        m.composerChipKind !== 'needs_clarification' &&
        m.composerChipKind !== 'relationship' &&
        m.composerChipKind !== 'shared_history',
    );
    const imagesToSend = pendingImages.length > 0 ? pendingImages : undefined;
    // Suppress vault auto-restore before clearing — threadId often changes
    // while the send is in flight and would otherwise re-fill the composer.
    skipVaultAutoRestoreRef.current = true;
    onSubmit(text, entitiesToSend, previewCorrections, imagesToSend);
    // Entity-chip state (matches/dismissed/confirming/included) always belonged
    // to the turn we just submitted, so it always clears.
    dispatch(clearComposerState());
    // Only clear the composer text when we actually submitted what's in it. An
    // override that no longer matches the live input means the user typed
    // something during the auto-submit delay — leave their text in place as
    // their own draft instead of silently discarding it. clearComposerState
    // above also wipes Redux's draftText mirror, so resync it to the
    // preserved local input rather than leaving the two out of sync.
    if (overrideText === undefined || overrideText === input) {
      setInput('');
    } else {
      // Cancels any pending debounced persist for the old value before
      // re-persisting the preserved input, so a stale timer can't later
      // overwrite this with what was just submitted.
      flushDraftPersist(input);
    }
    setPreviewCorrections([]);
    setPendingImages([]);
    setImageError(null);
  }, [input, pendingImages, onSubmit, visibleMatches, includedSlots, previewCorrections, setInput, flushDraftPersist]);

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
        entityIndexer.analyze(input);
        openConfirmedComposerEntity(confirmed);
      } catch (error) {
        setConfirmError(error instanceof Error ? error.message : 'Could not confirm entity');
      } finally {
        dispatch(removeComposerConfirming(slot));
      }
    },
    [dispatch, entityIndexer, input]
  );

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
    handleComposerBlur,
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
