import { Download, Search as SearchIcon, FileText } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useState } from 'react';

type ChatHeaderProps = {
  messageCount: number;
  onSearchClick?: () => void;
  onExportMarkdown?: () => void;
  onExportJSON?: () => void;
  onWorkSummaryClick?: () => void;
};

export const ChatHeader = ({ 
  messageCount, 
  onSearchClick, 
  onExportMarkdown, 
  onExportJSON,
  onWorkSummaryClick
}: ChatHeaderProps) => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="border-b border-border/60 bg-black/20 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-white/80">Chat</h2>
        {messageCount > 0 && (
          <span className="text-xs text-white/40">
            {messageCount} message{messageCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onWorkSummaryClick}
          className="text-white/60 hover:text-white"
          title="Import work summary from ChatGPT"
        >
          <FileText className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSearchClick}
          className="text-white/60 hover:text-white"
          title="Search conversation (⌘K)"
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="text-white/60 hover:text-white"
            title="Export conversation"
          >
            <Download className="h-4 w-4" />
          </Button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-black/90 border border-border/60 rounded-lg p-1 z-50 min-w-[150px]">
              <button
                onClick={() => {
                  onExportMarkdown?.();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-black/60 rounded transition-colors"
              >
                Export as Markdown
              </button>
              <button
                onClick={() => {
                  onExportJSON?.();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-black/60 rounded transition-colors"
              >
                Export as JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

