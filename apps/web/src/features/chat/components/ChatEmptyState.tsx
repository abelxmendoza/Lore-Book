import { useLocation } from 'react-router-dom';
import { Bot, Heart, Paperclip, FileText, MessageSquare, Image as ImageIcon, Lock } from 'lucide-react';

const LOVE_STARTERS = [
  'I went on a date last night…',
  'I need to decode a text they sent me.',
  "There's someone I've been thinking about.",
  'Something happened with [Name] and I need to process it.',
  'I want to talk through a pattern I keep seeing in my relationships.',
  'I just got out of something and I need to think.',
];

const LoveEmptyState = () => (
  <div className="text-center py-16 sm:py-20 text-white/60 px-4 sm:px-6 max-w-2xl mx-auto">
    <Heart className="h-16 w-16 mx-auto mb-6 text-pink-400/50" />
    <h2 className="text-2xl sm:text-3xl font-semibold mb-3 text-white">Your Relationship Advisor</h2>
    <p className="text-sm sm:text-base text-pink-300/80 mb-2 max-w-md mx-auto">
      I know your full love life — who you've been with, what happened, the patterns, the drift.
    </p>
    <p className="text-base sm:text-lg mb-10 text-white/60 leading-relaxed">
      Tell me about a date. Decode a situation. Talk through what keeps happening.<br />
      Everything you share is tracked quietly in the background.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-10 text-left">
      {LOVE_STARTERS.map(starter => (
        <button
          key={starter}
          type="button"
          onClick={() => {
            const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder]');
            if (input) {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
              nativeInputValueSetter?.call(input, starter);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.focus();
            }
          }}
          className="px-4 py-3 rounded-lg border border-pink-500/20 bg-black/40 hover:bg-pink-950/20 hover:border-pink-500/40 transition-colors text-sm text-white/60 hover:text-white/80 text-left"
        >
          "{starter}"
        </button>
      ))}
    </div>

    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
        <Lock className="h-4 w-4 text-green-400 flex-shrink-0" />
        <p className="text-xs text-green-400">
          <strong>Private:</strong> Your conversations are encrypted and never shared.
        </p>
      </div>
    </div>

    <p className="text-xs text-white/30">
      What you tell me automatically updates your relationship timeline, patterns, and history.
    </p>
  </div>
);

export const ChatEmptyState = () => {
  const location = useLocation();
  const isLoveSurface = location.pathname === '/love';

  if (isLoveSurface) return <LoveEmptyState />;

  return (
    <div className="text-center py-16 sm:py-20 lg:py-24 text-white/60 px-4 sm:px-6 lg:px-8 max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto chat-message-enter-system">
      <Bot className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 mx-auto mb-6 sm:mb-8 text-primary/50" />
      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-2 sm:mb-3 text-white">AI Life Guidance Chat</h2>
      <p className="text-sm sm:text-base text-primary/80 mb-4 sm:mb-5 max-w-xl mx-auto">
        This is where your story is built. Timelines, characters, and quests fill in as you talk.
      </p>
      <p className="text-base sm:text-lg lg:text-xl mb-8 sm:mb-10 text-white/70 leading-relaxed sm:leading-loose">
        Dump everything freely here. I&apos;ll reflect back, make connections,<br />
        and help you understand your story while automatically updating your timeline.
      </p>
      
      {/* Privacy Reassurance */}
      <div className="mb-8 sm:mb-10 lg:mb-12 flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 sm:px-5 lg:px-6 py-3 sm:py-4">
          <Lock className="h-5 w-5 sm:h-6 sm:w-6 text-green-400" />
          <p className="text-sm sm:text-base lg:text-lg text-green-400">
            <strong className="font-semibold">Private & Secure:</strong> Your conversations are encrypted and never shared. Only you can access your data.
          </p>
        </div>
      </div>
      
      {/* Document Upload Instructions */}
      <div className="mb-10 sm:mb-12 lg:mb-16 space-y-5 sm:space-y-6 lg:space-y-8 max-w-2xl lg:max-w-3xl mx-auto">
        <div className="p-5 sm:p-6 lg:p-8 bg-primary/10 border border-primary/30 rounded-lg">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Paperclip className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-white">Upload Other Documents</h3>
          </div>
          <p className="text-sm sm:text-base lg:text-lg text-white/70 mb-4 sm:mb-5">
            You can also upload:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-sm sm:text-base text-white/60">
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

        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Upload Your Resume</h3>
          </div>
          <p className="text-xs text-white/70 mb-2">
            Click the <Paperclip className="h-3 w-3 inline text-primary" /> paperclip button below to upload your resume (PDF, DOC, DOCX, or TXT).
          </p>
          <p className="text-xs text-purple-200/80">
            ✨ Automatically extracts skills, experience, and achievements to track your career growth.
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
      </div>

      <div className="text-sm sm:text-base lg:text-lg text-white/40 space-y-2 sm:space-y-3 max-w-2xl mx-auto mb-8 sm:mb-10">
        <p>✨ I'll track dates, times, and occurrences</p>
        <p>🔗 I'll make connections to your past entries</p>
        <p>📖 I'll update your timeline, memoir, and chapters</p>
        <p>⚠️ I'll check for continuity and conflicts</p>
        <p>💡 I'll provide strategic guidance based on your patterns</p>
      </div>
      <div className="mt-8 sm:mt-10 text-sm sm:text-base text-white/30">
        <p>Try commands: <span className="font-mono text-primary/70">/recent</span>, <span className="font-mono text-primary/70">/search</span>, <span className="font-mono text-primary/70">/characters</span></p>
      </div>
    </div>
  );
};

