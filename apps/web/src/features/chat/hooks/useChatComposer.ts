import { useState, useRef, useEffect, useCallback } from 'react';
import type { CorrectedPreviewSpan } from '../../../lib/entityCorrectionTypes';
import { useMoodEngine, localHeuristic } from '../../../hooks/useMoodEngine';
import { useAutoTagger } from '../../../hooks/useAutoTagger';
import { useEntityIndexer } from '../../../hooks/useEntityIndexer';
import { getCommandSuggestions, parseSlashCommand } from '../../../utils/slashCommands';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  clearComposerState,
  dismissComposerMatch,
  setComposerDraft,
  composerMatchSlot,
  addComposerConfirming,
  removeComposerConfirming,
  toggleComposerIncluded,
} from '../../../store/slices/composerSlice';
import { selectVisibleComposerMatches, selectComposerConfirmingSlots, selectComposerIncludedSlots } from '../../../store/selectors/composerSelectors';
import { confirmComposerEntity } from '../../../lib/confirmComposerEntity';

import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

type UseChatComposerOptions = {
  /** Desktop default: Enter sends, Shift+Enter newline. Mobile should pass false. */
  submitOnEnter?: boolean;
  threadId?: string;
};

export const useChatComposer = (
  onSubmit: (
    message: string,
    certifiedEntities?: CertifiedEntityMatch[],
    previewCorrections?: CorrectedPreviewSpan[]
  ) => void,
  initialValue?: string | null,
  options: UseChatComposerOptions = {},
) => {
  const { submitOnEnter = true, threadId } = options;
  const dispatch = useAppDispatch();
  const visibleMatches = useAppSelector(selectVisibleComposerMatches);
  const confirmingSlots = useAppSelector(selectComposerConfirmingSlots);
  const includedSlots = useAppSelector(selectComposerIncludedSlots);
  const [input, setInputState] = useState(initialValue || '');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [previewCorrections, setPreviewCorrections] = useState<CorrectedPreviewSpan[]>([]);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<Array<{ command: string; description: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const moodEngine = useMoodEngine();
  const autoTagger = useAutoTagger();
  const entityIndexer = useEntityIndexer();

  const setInput = useCallback(
    (value: string) => {
      setInputState(value);
      dispatch(setComposerDraft(value));
    },
    [dispatch]
  );

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

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const parsed = parseSlashCommand(input);
    const entitiesToSend = visibleMatches.filter(
      (m) =>
        includedSlots.includes(composerMatchSlot(m)) &&
        m.status !== 'draft' &&
        m.composerChipKind !== 'needs_clarification' &&
        m.composerChipKind !== 'relationship' &&
        m.composerChipKind !== 'shared_history',
    );
    if (parsed) {
      onSubmit(input.trim(), entitiesToSend, previewCorrections);
    } else {
      onSubmit(input.trim(), entitiesToSend, previewCorrections);
    }
    setInput('');
    setPreviewCorrections([]);
    dispatch(clearComposerState());
  }, [input, onSubmit, visibleMatches, includedSlots, previewCorrections, setInput, dispatch]);

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
        await confirmComposerEntity(match);
        entityIndexer.retryLoad();
        entityIndexer.analyze(input);
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
  }, []);

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
  };
};

