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
import {
  latestRecoverableStory,
  readComposerDraft,
  saveComposerDraft,
  subscribeStoryRecovery,
} from '../services/storySafetyVault';

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
  const draftOwnerId = user?.id ?? 'guest-or-anonymous';
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
  
  const moodEngine = useMoodEngine();
  const autoTagger = useAutoTagger();
  const entityIndexer = useEntityIndexer();

  const setInput = useCallback(
    (value: string) => {
      setInputState(value);
      saveComposerDraft(draftOwnerId, threadId, value);
      dispatch(setComposerDraft(value));
    },
    [dispatch, draftOwnerId, threadId]
  );

  // Restore a story immediately when the send path reports that the user's
  // message was not durably persisted. Also recovers after a reload/crash.
  useEffect(() => {
    const recovered = readComposerDraft(draftOwnerId, threadId)
      || latestRecoverableStory(draftOwnerId, threadId)?.text
      || '';
    if (recovered && !input) {
      setInputState(recovered);
      dispatch(setComposerDraft(recovered));
    }
    return subscribeStoryRecovery((attempt) => {
      if (attempt.ownerId !== draftOwnerId || attempt.threadId !== threadId) return;
      setInputState(attempt.text);
      saveComposerDraft(draftOwnerId, threadId, attempt.text);
      dispatch(setComposerDraft(attempt.text));
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  }, [dispatch, draftOwnerId, threadId]); // input intentionally checked only when the owner/thread changes

  // Analyze input for mood, tags, and characters (debounced to avoid excessive API calls)
  useEffect(() => {
    // Immediate updates for non-API operations
    if (input.trim()) {
      // Non-API operations can run immediately
      autoTagger.refreshSuggestions(input);
      entityIndexer.analyze(input, threadId);
      
      // Check for slash commands
      if (input.startsWith('/')) {
        const suggestions = getCommandSuggestions(input);
        setCommandSuggestions(suggestions);
        setShowCommandSuggestions(suggestions.length > 0);
      } else {
        setShowCommandSuggestions(false);
      }
    } else {
      moodEngine.setScore(0);
      autoTagger.refreshSuggestions('');
      entityIndexer.analyze('');
      setShowCommandSuggestions(false);
    }

    // Use local heuristic for realtime mood feedback — no API call during typing
    if (input.trim()) {
      moodEngine.setScore(localHeuristic(input));
    }
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

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
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
    onSubmit(text, entitiesToSend, previewCorrections, imagesToSend);
    setInput('');
    setPreviewCorrections([]);
    setPendingImages([]);
    setImageError(null);
    dispatch(clearComposerState());
  }, [input, pendingImages, onSubmit, visibleMatches, includedSlots, previewCorrections, setInput, dispatch]);

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
    maxImages: MAX_CHAT_IMAGES_PER_TURN,
  };
};
