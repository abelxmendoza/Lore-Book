import { useState, useRef, useEffect, useCallback } from 'react';
import { useMoodEngine } from '../../../hooks/useMoodEngine';
import { useAutoTagger } from '../../../hooks/useAutoTagger';
import { useCharacterIndexer } from '../../../hooks/useCharacterIndexer';
import { getCommandSuggestions, parseSlashCommand } from '../../../utils/slashCommands';

export const useChatComposer = (onSubmit: (message: string) => void) => {
  const [input, setInput] = useState('');
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<Array<{ command: string; description: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const moodEngine = useMoodEngine();
  const autoTagger = useAutoTagger();
  const characterIndexer = useCharacterIndexer();

  // Analyze input for mood, tags, and characters
  useEffect(() => {
    if (input.trim()) {
      moodEngine.evaluate(input);
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
  }, [input, moodEngine, autoTagger, characterIndexer]);

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

