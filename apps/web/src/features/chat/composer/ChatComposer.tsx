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
    <div className="border-t border-border/60 bg-black/20 chat-composer flex-shrink-0">
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

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-4">
        <div className="flex gap-1 sm:gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder="Message Lore Book... (Press ⌘/ for commands, Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || disabled}
              className="pr-10 sm:pr-12 bg-black/40 border-border/50 text-white placeholder:text-white/40 resize-none min-h-[50px] sm:min-h-[60px] max-h-[150px] sm:max-h-[200px] overflow-y-auto text-sm sm:text-base"
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
          <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleUploadClick}
              disabled={loading || disabled}
              className={`text-white/60 hover:text-white h-9 w-9 sm:h-11 sm:w-11 ${showUpload ? 'text-primary' : ''}`}
              title="Upload documents, resumes, biographies, or diaries"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleChatGPTImportClick}
              disabled={loading || disabled}
              className={`text-white/60 hover:text-white h-9 w-9 sm:h-11 sm:w-11 ${showChatGPTImport ? 'text-primary' : ''}`}
              title="Import ChatGPT conversation with fact-checking"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button 
              type="submit" 
              disabled={!input.trim() || loading || disabled}
              leftIcon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              className="h-9 sm:h-11 px-3 sm:px-6 text-sm sm:text-base"
              style={{
                backgroundColor: showHints ? `${moodColor}20` : undefined,
                borderColor: showHints ? `${moodColor}40` : undefined
              }}
            >
              <span className="hidden sm:inline">{loading ? 'Sending' : 'Send'}</span>
              <span className="sm:hidden">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

