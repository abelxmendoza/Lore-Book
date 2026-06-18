import { useState, useRef, useEffect, useCallback } from 'react';
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
} from '../../../store/slices/composerSlice';
import { selectVisibleComposerMatches } from '../../../store/selectors/composerSelectors';

import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

export const useChatComposer = (
  onSubmit: (message: string, certifiedEntities?: CertifiedEntityMatch[]) => void,
  initialValue?: string | null
) => {
  const dispatch = useAppDispatch();
  const visibleMatches = useAppSelector(selectVisibleComposerMatches);
  const [input, setInputState] = useState(initialValue || '');
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
      entityIndexer.analyze(input);
      
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
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const parsed = parseSlashCommand(input);
    const entitiesToSend = visibleMatches;
    if (parsed) {
      onSubmit(input.trim(), entitiesToSend);
    } else {
      onSubmit(input.trim(), entitiesToSend);
    }
    setInput('');
    dispatch(clearComposerState());
  }, [input, onSubmit, visibleMatches, setInput, dispatch]);

  const dismissMatch = useCallback(
    (match: CertifiedEntityMatch) => {
      dispatch(dismissComposerMatch(composerMatchSlot(match)));
    },
    [dispatch]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const insertSuggestion = useCallback((command: string) => {
    setInput(`${command} `);
    setShowCommandSuggestions(false);
    textareaRef.current?.focus();
  }, []);

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
    dismissMatch,
    handleSubmit,
    handleKeyDown,
    insertSuggestion
  };
};

