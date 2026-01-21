import { Send, Loader2, Upload, Paperclip, MessageSquare } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card } from '../../../components/ui/card';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerHints } from './ComposerHints';
import { MoodIndicator } from './MoodIndicator';
import { TagSuggestions } from './TagSuggestions';
import { useState, useRef } from 'react';
import { DocumentUpload } from '../components/DocumentUpload';
import { ChatGPTImport } from '../components/ChatGPTImport';

type ChatComposerProps = {
  onSubmit: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
  onUploadComplete?: () => void;
};

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false,
  onUploadComplete
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

  const [showUpload, setShowUpload] = useState(false);
  const [showChatGPTImport, setShowChatGPTImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    setShowUpload(!showUpload);
    if (showUpload) setShowChatGPTImport(false);
  };

  const handleChatGPTImportClick = () => {
    setShowChatGPTImport(!showChatGPTImport);
    if (showChatGPTImport) setShowUpload(false);
  };

  return (
    <div className="border-t border-white/10 bg-black/40 backdrop-blur-sm chat-composer flex-shrink-0">
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

      {/* Document Upload Section */}
      {showUpload && (
        <div className="px-4 py-2 border-b border-border/60 bg-black/30 max-h-[300px] overflow-y-auto">
          <DocumentUpload
            compact={true}
            onUploadComplete={async () => {
              setShowUpload(false);
              onUploadComplete?.();
            }}
            onUploadError={(error) => {
              console.error('Document upload error:', error);
            }}
          />
        </div>
      )}

      {/* ChatGPT Import Section */}
      {showChatGPTImport && (
        <div className="px-4 py-2 border-b border-border/60 bg-black/30 max-h-[400px] overflow-y-auto">
          <ChatGPTImport
            onImportComplete={async (stats) => {
              setShowChatGPTImport(false);
              console.log('ChatGPT import complete:', stats);
              onUploadComplete?.();
            }}
            onImportError={(error) => {
              console.error('ChatGPT import error:', error);
            }}
          />
        </div>
      )}

      {/* Input Form - ChatGPT style */}
      <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-end gap-1.5 sm:gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              className="w-full bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-white/50 resize-none min-h-[48px] sm:min-h-[52px] max-h-[200px] overflow-y-auto text-sm sm:text-base px-3 sm:px-4 py-2.5 sm:py-3 pr-10 sm:pr-12 focus:border-white/20 focus:outline-none transition-colors"
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
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleUploadClick}
              disabled={loading || disabled}
              className={`text-white/50 hover:text-white h-8 w-8 sm:h-9 sm:w-9 ${showUpload ? 'text-primary' : ''}`}
              title="Upload documents"
            >
              <Paperclip className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleChatGPTImportClick}
              disabled={loading || disabled}
              className={`text-white/50 hover:text-white h-8 w-8 sm:h-9 sm:w-9 ${showChatGPTImport ? 'text-primary' : ''}`}
              title="Import ChatGPT conversation"
            >
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button 
              type="submit" 
              disabled={!input.trim() || loading || disabled}
              className="h-8 w-8 sm:h-9 sm:w-9 p-0 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Send message"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-primary" />
              ) : (
                <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

