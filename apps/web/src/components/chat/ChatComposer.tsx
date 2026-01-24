import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2, Command } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card } from '../ui/card';
import { parseSlashCommand, getCommandSuggestions, SLASH_COMMANDS } from '../../utils/slashCommands';
import { useMoodEngine } from '../../hooks/useMoodEngine';
import { useAutoTagger } from '../../hooks/useAutoTagger';
import { useCharacterIndexer } from '../../hooks/useCharacterIndexer';

type ChatComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
};

export const ChatComposer = ({
  input,
  onInputChange,
  onSubmit,
  loading,
  disabled = false
}: ChatComposerProps) => {
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

    // Debounce mood evaluation (API call) - only run after user stops typing
    const debounceTimer = setTimeout(() => {
      if (input.trim()) {
        moodEngine.evaluate(input);
      }
    }, 500); // Wait 500ms after last keystroke

    return () => {
      clearTimeout(debounceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]); // Only depend on input, callbacks are stable

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || disabled) return;

    const parsed = parseSlashCommand(input);
    if (parsed) {
      // Handle slash command
      handleSlashCommand(parsed.command, parsed.args);
    } else {
      onSubmit(input.trim());
    }
  };

  const handleSlashCommand = (command: string, args: string) => {
    // For now, just send the command as-is
    // The backend or frontend can handle it
    onSubmit(input.trim());
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'ArrowDown' && showCommandSuggestions && commandSuggestions.length > 0) {
      e.preventDefault();
      // Could implement suggestion selection here
    }
  };

  const insertSuggestion = (command: string) => {
    onInputChange(`${command} `);
    setShowCommandSuggestions(false);
    textareaRef.current?.focus();
  };

  const showHints = input.trim().length > 10;
  const moodColor = moodEngine.mood.color;

  return (
    <div className="border-t border-border/60 bg-black/20">
      {/* Command Suggestions */}
      {showCommandSuggestions && commandSuggestions.length > 0 && (
        <Card className="mx-4 mt-2 mb-2 bg-black/60 border-border/50">
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-2 text-xs text-white/50 mb-1">
              <Command className="h-3 w-3" />
              <span>Commands</span>
            </div>
            {commandSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => insertSuggestion(suggestion.command)}
                className="w-full text-left px-2 py-1 rounded hover:bg-black/40 text-xs text-white/70 hover:text-white transition-colors"
              >
                <span className="font-mono text-primary/70">{suggestion.command}</span>
                <span className="ml-2 text-white/50">{suggestion.description}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Hints Bar */}
      {showHints && (
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-3 text-xs">
          {moodEngine.mood.score !== 0 && (
            <div className="flex items-center gap-2 text-white/60">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: moodColor }}
              />
              <span>{moodEngine.mood.label}</span>
            </div>
          )}
          {characterIndexer.matches.length > 0 && (
            <div className="flex items-center gap-1 text-white/60">
              <span>{characterIndexer.matches.length} character{characterIndexer.matches.length > 1 ? 's' : ''} mentioned</span>
            </div>
          )}
          {autoTagger.suggestions.length > 0 && (
            <div className="flex items-center gap-1 text-white/60">
              <span>{autoTagger.suggestions.length} tag{autoTagger.suggestions.length > 1 ? 's' : ''} suggested</span>
            </div>
          )}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book... (Press ⌘/ for commands, Shift+Enter for new line)"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              disabled={loading || disabled}
              className="pr-12 bg-black/40 border-border/50 text-white placeholder:text-white/40 resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
              style={{
                borderColor: showHints ? `${moodColor}66` : undefined,
                boxShadow: showHints ? `0 0 10px ${moodColor}22` : undefined
              }}
              onKeyDown={handleKeyDown}
            />
            {showHints && moodEngine.mood.score !== 0 && (
              <div 
                className="absolute right-2 top-2 w-2 h-2 rounded-full opacity-60"
                style={{ backgroundColor: moodColor }}
                title={moodEngine.mood.label}
              />
            )}
          </div>
          <Button 
            type="submit" 
            disabled={!input.trim() || loading || disabled} 
            leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            style={{
              backgroundColor: showHints ? `${moodColor}20` : undefined,
              borderColor: showHints ? `${moodColor}40` : undefined
            }}
          >
            {loading ? 'Sending' : 'Send'}
          </Button>
        </div>
      </form>
    </div>
  );
};

