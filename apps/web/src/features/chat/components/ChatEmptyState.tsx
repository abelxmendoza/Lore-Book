import { Bot } from 'lucide-react';

export const ChatEmptyState = () => {
  return (
    <div className="text-center py-12 text-white/60">
      <Bot className="h-12 w-12 mx-auto mb-4 text-primary/50" />
      <h2 className="text-xl font-semibold mb-2">AI Life Guidance Chat</h2>
      <p className="text-sm mb-4">
        Dump everything freely here. I'll reflect back, make connections,<br />
        and help you understand your story while automatically updating your timeline.
      </p>
      <div className="text-xs text-white/40 space-y-1 max-w-md mx-auto">
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

