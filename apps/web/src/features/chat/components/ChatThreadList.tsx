import { MessageSquarePlus, MessageSquareText, Trash2, PanelLeftClose, PanelLeft, PanelRightClose } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { ChatThread } from '../hooks/useChatThreads';

type ChatThreadListProps = {
  threads: ChatThread[];
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** On mobile: drawer open state and close callback (backdrop + after select) */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  isMobile?: boolean;
};

function formatThreadDate(updatedAt: string): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ChatThreadList = ({
  threads,
  currentThreadId,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  collapsed,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileClose,
  isMobile = false,
}: ChatThreadListProps) => {
  const handleNewChat = () => {
    onNewChat();
    onMobileClose?.();
  };
  /** Open thread in main area so the full conversation shows there (replacing empty state). */
  const handleSelectThread = (id: string) => {
    onSelectThread(id);
    onMobileClose?.();
  };

  const content = (
    <>
      <div className="flex items-center gap-1 p-2 sm:p-2 border-b border-white/10 flex-shrink-0 min-h-[52px] sm:min-h-0">
        {!collapsed && (
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-2 flex-1 min-w-0 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 active:bg-primary/25 text-white px-3 py-2.5 sm:px-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium transition-colors touch-manipulation"
          >
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">New chat</span>
          </button>
        )}
        {!isMobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
            aria-label={collapsed ? 'Expand thread list' : 'Collapse thread list'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={onMobileClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
            aria-label="Close"
          >
            <PanelRightClose className="h-5 w-5" />
          </button>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden chat-scrollbar py-2 min-h-0 overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {collapsed && !isMobile ? (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 touch-manipulation"
              title="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            {threads.slice(0, 8).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectThread(t.id)}
                title={t.title}
                className={cn(
                  'p-2 rounded-lg transition-colors touch-manipulation',
                  currentThreadId === t.id
                    ? 'bg-primary/20 text-primary'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                )}
              >
                <MessageSquareText className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : (
          <ul className="space-y-0.5 px-2">
            {threads.map((t) => (
              <li key={t.id}>
                <div
                  className={cn(
                    'group flex items-center gap-2 rounded-lg py-2.5 px-2 sm:py-2 sm:px-2 cursor-pointer transition-colors min-h-[44px] sm:min-h-0',
                    currentThreadId === t.id
                      ? 'bg-primary/15 border border-primary/30 text-white'
                      : 'hover:bg-white/5 active:bg-white/10 text-white/80'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectThread(t.id)}
                    className="flex-1 min-w-0 text-left flex items-center gap-2 py-1 touch-manipulation min-h-[44px] sm:min-h-0"
                  >
                    <MessageSquareText className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title || 'New chat'}</p>
                      <p className="text-[10px] text-white/40">{formatThreadDate(t.updatedAt)}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onDeleteThread(t.id, e)}
                    className={cn(
                      'p-2 sm:p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 touch-manipulation',
                      isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                    aria-label="Delete thread"
                  >
                    <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Backdrop - tap to close */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 sm:hidden',
            mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onMobileClose}
          aria-hidden
        />
        {/* Drawer - slides in from right (like sidebar menu) */}
        <div
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-[min(20rem,90vw)] max-w-[20rem] flex flex-col border-l border-white/10 bg-black/95 sm:hidden transition-transform duration-200 ease-out will-change-transform',
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top, 0)',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
            minHeight: '100dvh',
            maxHeight: '100dvh',
          }}
        >
          {content}
        </div>
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-col border-r border-white/10 bg-black/60 flex-shrink-0 transition-[width] duration-200 overflow-hidden hidden sm:flex',
          collapsed ? 'w-12' : 'w-56 sm:w-64'
        )}
      >
        {content}
      </div>
    </>
  );
};
