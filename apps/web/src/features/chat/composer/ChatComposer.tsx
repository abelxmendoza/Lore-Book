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
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="flex items-end gap-2 sm:gap-3 lg:gap-4">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              className="w-full bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-white/50 resize-none min-h-[56px] sm:min-h-[64px] lg:min-h-[72px] max-h-[300px] overflow-y-auto text-base sm:text-lg lg:text-xl px-4 sm:px-5 lg:px-6 py-3 sm:py-4 lg:py-5 pr-12 sm:pr-14 lg:pr-16 leading-relaxed sm:leading-loose focus:border-white/20 focus:outline-none transition-colors"
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
          <div className="flex items-center gap-1 sm:gap-2 lg:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleUploadClick}
              disabled={loading || disabled}
              className={`text-white/50 hover:text-white h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 ${showUpload ? 'text-primary' : ''}`}
              title="Upload documents"
            >
              <Paperclip className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleChatGPTImportClick}
              disabled={loading || disabled}
              className={`text-white/50 hover:text-white h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 ${showChatGPTImport ? 'text-primary' : ''}`}
              title="Import ChatGPT conversation"
            >
              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
            </Button>
            <Button 
              type="submit" 
              disabled={!input.trim() || loading || disabled}
              className="h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 p-0 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Send message"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 animate-spin text-primary" />
              ) : (
                <Send className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-primary" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

