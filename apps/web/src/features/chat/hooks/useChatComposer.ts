import { useState, useRef, useEffect, useCallback } from 'react';
import { useMoodEngine, localHeuristic } from '../../../hooks/useMoodEngine';
import { useAutoTagger } from '../../../hooks/useAutoTagger';
import { useCharacterIndexer } from '../../../hooks/useCharacterIndexer';
import { getCommandSuggestions, parseSlashCommand } from '../../../utils/slashCommands';

export const useChatComposer = (onSubmit: (message: string) => void, initialValue?: string | null) => {
  const [input, setInput] = useState(initialValue || '');
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<Array<{ command: string; description: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const moodEngine = useMoodEngine();
  const autoTagger = useAutoTagger();
  const characterIndexer = useCharacterIndexer();

  // Analyze input for mood, tags, and characters (debounced to avoid excessive API calls)
  useEffect(() => {
    // Immediate updates for non-API operations
    if (input.trim()) {
      // Non-API operations can run immediately
      autoTagger.refreshSuggestions(input);
      characterIndexer.analyze(input);
      
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
      characterIndexer.analyze('');
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
    if (parsed) {
      // Slash commands are handled in useChat
      onSubmit(input.trim());
    } else {
      onSubmit(input.trim());
    }
    setInput('');
  }, [input, onSubmit]);

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
    characterIndexer,
    handleSubmit,
    handleKeyDown,
    insertSuggestion
  };
};

