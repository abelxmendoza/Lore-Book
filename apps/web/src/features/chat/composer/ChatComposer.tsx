import { Send, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card } from '../../../components/ui/card';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerHints } from './ComposerHints';
import { MoodIndicator } from './MoodIndicator';
import { TagSuggestions } from './TagSuggestions';

type ChatComposerProps = {
  onSubmit: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
};

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false
}: ChatComposerProps) => {
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
    characterIndexer,
    handleSubmit,
    handleKeyDown,
    insertSuggestion
  } = useChatComposer(onSubmit);

  return (
    <div className="border-t border-border/60 bg-black/20 chat-composer">
      {/* Command Suggestions */}
      {showCommandSuggestions && commandSuggestions.length > 0 && (
        <CommandSuggestions
          suggestions={commandSuggestions}
          onSelect={insertSuggestion}
        />
      )}

      {/* Hints Bar */}
      {showHints && (
        <ComposerHints
          mood={moodEngine.mood}
          characterCount={characterIndexer.matches.length}
          tagCount={autoTagger.suggestions.length}
        />
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book... (Press ⌘/ for commands, Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              className="pr-12 bg-black/40 border-border/50 text-white placeholder:text-white/40 resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
              style={{
                borderColor: showHints ? `${moodColor}66` : undefined,
                boxShadow: showHints ? `0 0 10px ${moodColor}22` : undefined
              }}
              onKeyDown={handleKeyDown}
            />
            {showHints && moodEngine.mood.score !== 0 && (
              <MoodIndicator
                color={moodColor}
                label={moodEngine.mood.label}
                position="top-right"
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

