import { Send, Loader2, Upload, Paperclip, MessageSquare } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { Card } from '../../../components/ui/card';
import { useChatComposer } from '../hooks/useChatComposer';
import { CommandSuggestions } from './CommandSuggestions';
import { ComposerHints } from './ComposerHints';
import { MoodIndicator } from './MoodIndicator';
import { TagSuggestions } from './TagSuggestions';
import { useState, useRef, useEffect } from 'react';
import { DocumentUpload } from '../components/DocumentUpload';
import { ChatGPTImport } from '../components/ChatGPTImport';

type ChatComposerProps = {
  onSubmit: (message: string) => void;
  loading: boolean;
  disabled?: boolean;
  onUploadComplete?: () => void;
  initialPrompt?: string | null;
  initialDate?: string | null;
};

export const ChatComposer = ({
  onSubmit,
  loading,
  disabled = false,
  onUploadComplete,
  initialPrompt,
  initialDate
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
  } = useChatComposer(onSubmit, initialPrompt);

  // Pre-fill input with initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !input) {
      setInput(initialPrompt);
      // Focus textarea after setting input
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [initialPrompt, input, setInput]);

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
    <div className="border-t border-white/10 bg-black/40 backdrop-blur-sm chat-composer flex-shrink-0 safe-area-bottom">
      {/* Command Suggestions */}
      {showCommandSuggestions && commandSuggestions.length > 0 && (
        <CommandSuggestions
          suggestions={commandSuggestions}
          onSelect={insertSuggestion}
        />
      )}

      {/* Date Indicator */}
      {initialDate && (
        <div className="px-3 sm:px-4 py-2 border-b border-yellow-500/30 bg-yellow-500/5">
          <div className="px-2 py-1 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded">
            Filling gap from {new Date(initialDate).toLocaleDateString()}
          </div>
        </div>
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
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[300px] sm:max-h-[350px] overflow-y-auto">
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
        <div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-black/50 max-h-[400px] sm:max-h-[450px] overflow-y-auto">
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
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-4 lg:px-10 xl:px-12 py-2 sm:py-3 lg:py-4 xl:py-5">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Upload Icons - Outside textarea, left side */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={loading || disabled}
              className={`group relative p-1.5 sm:p-2 rounded-lg transition-colors touch-manipulation ${showUpload ? 'bg-primary/20 text-sky-400' : 'text-sky-400/70 hover:text-sky-400 hover:bg-white/10'} ${loading || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Upload documents, photos, resumes"
            >
              <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                Upload documents, photos, resumes
              </span>
            </button>
            <button
              type="button"
              onClick={handleChatGPTImportClick}
              disabled={loading || disabled}
              className={`group relative p-1.5 sm:p-2 rounded-lg transition-colors touch-manipulation ${showChatGPTImport ? 'bg-primary/20 text-yellow-400' : 'text-yellow-400/70 hover:text-yellow-400 hover:bg-white/10'} ${loading || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Import ChatGPT conversation"
            >
              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                Import ChatGPT conversation
              </span>
            </button>
          </div>

          {/* Textarea Container - Long oval shape */}
          <div className="flex-1 relative min-w-0">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              className="w-full bg-white/5 border border-white/10 rounded-full text-white placeholder:text-white/50 resize-none min-h-[44px] sm:min-h-[48px] lg:min-h-[52px] max-h-[120px] sm:max-h-[150px] overflow-y-auto text-sm sm:text-base px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 lg:py-3.5 pr-11 sm:pr-12 lg:pr-14 leading-normal focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
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

          {/* Send Button - Right side */}
          <button
            type="submit"
            disabled={!input.trim() || loading || disabled}
            className="group relative flex-shrink-0 h-[44px] sm:h-[48px] lg:h-[52px] w-[44px] sm:w-[48px] lg:w-[52px] flex items-center justify-center rounded-full bg-primary/20 hover:bg-primary/30 active:bg-primary/40 border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all touch-manipulation disabled:hover:bg-primary/20"
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary" />
            ) : (
              <Send className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            )}
            {/* Tooltip */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Send message
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};

