import { Bot, Paperclip, FileText, MessageSquare, Image as ImageIcon } from 'lucide-react';

export const ChatEmptyState = () => {
  return (
    <div className="text-center py-12 text-white/60 px-4">
      <Bot className="h-12 w-12 mx-auto mb-4 text-primary/50" />
      <h2 className="text-xl font-semibold mb-2 text-white">AI Life Guidance Chat</h2>
      <p className="text-sm mb-6 text-white/70">
        Dump everything freely here. I'll reflect back, make connections,<br />
        and help you understand your story while automatically updating your timeline.
      </p>
      
      {/* Document Upload Instructions */}
      <div className="mb-8 space-y-4 max-w-lg mx-auto">
        <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Paperclip className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-white">Upload Your Documents</h3>
          </div>
          <p className="text-xs text-white/70 mb-3">
            Click the <Paperclip className="h-3 w-3 inline text-primary" /> paperclip button below to upload:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/60">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Biographies
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Autobiographies
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Diaries
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Journals
            </span>
          </div>
          <p className="text-xs text-white/50 mt-3">
            Supported formats: .txt, .md, .pdf, .doc, .docx, images
          </p>
        </div>

        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <ImageIcon className="h-5 w-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Upload Photos</h3>
          </div>
          <p className="text-xs text-white/70 mb-2">
            Upload photos and the AI will analyze them to suggest where they belong in your lore book.
          </p>
          <p className="text-xs text-blue-200/80">
            ✨ Photos of documents will extract text. Memory photos can be added to your lore book. Junk photos are automatically filtered.
          </p>
        </div>

        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <MessageSquare className="h-5 w-5 text-yellow-400" />
            <h3 className="text-sm font-semibold text-white">Import ChatGPT Conversations</h3>
          </div>
          <p className="text-xs text-white/70 mb-2">
            Click the <MessageSquare className="h-3 w-3 inline text-yellow-400" /> message button below to paste ChatGPT conversations.
          </p>
          <p className="text-xs text-yellow-200/80">
            ✨ All information will be automatically fact-checked and verified against your existing memories. Contradictions will be flagged for review.
          </p>
        </div>
      </div>

      <div className="text-xs text-white/40 space-y-1 max-w-md mx-auto mb-6">
        <p>✨ I'll track dates, times, and occurrences</p>
        <p>🔗 I'll make connections to your past entries</p>
        <p>📖 I'll update your timeline, memoir, and chapters</p>
        <p>⚠️ I'll check for continuity and conflicts</p>
        <p>💡 I'll provide strategic guidance based on your patterns</p>
      </div>
      <div className="mt-6 text-xs text-white/30">
        <p>Try commands: <span className="font-mono text-primary/70">/recent</span>, <span className="font-mono text-primary/70">/search</span>, <span className="font-mono text-primary/70">/characters</span></p>
      </div>
    </div>
  );
};

