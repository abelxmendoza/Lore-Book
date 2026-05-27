import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, MessageSquareText, Pencil, Trash2, PanelLeftClose, PanelLeft, X, Search } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { ChatThread } from '../hooks/useChatThreads';

type ChatThreadListProps = {
  threads: ChatThread[];
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onRenameThread?: (id: string, newTitle: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  isMobile?: boolean;
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTimestamp(updatedAt: string): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = diffMs / 60_000;

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;

  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type ThreadGroup = { label: string; threads: ChatThread[] };

function groupThreadsByDate(threads: ChatThread[]): ThreadGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;
  const monthStart = todayStart - 29 * 86_400_000;

  const buckets: Record<string, ChatThread[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    'Previous 30 days': [],
    Older: [],
  };

  for (const t of threads) {
    const ts = new Date(t.updatedAt).getTime();
    if (ts >= todayStart) buckets['Today'].push(t);
    else if (ts >= yesterdayStart) buckets['Yesterday'].push(t);
    else if (ts >= weekStart) buckets['Previous 7 days'].push(t);
    else if (ts >= monthStart) buckets['Previous 30 days'].push(t);
    else buckets['Older'].push(t);
  }

  return Object.entries(buckets)
    .filter(([, ts]) => ts.length > 0)
    .map(([label, ts]) => ({ label, threads: ts }));
}

// ── Thread item ───────────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  isActive,
  isMobile,
  onSelect,
  onDelete,
  onRename,
}: {
  thread: ChatThread;
  isActive: boolean;
  isMobile: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename?: (newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
    };
  }, []);

  // Cancel pending delete confirmation when thread becomes inactive
  useEffect(() => {
    if (!isActive && confirmingDelete) {
      setConfirmingDelete(false);
      if (confirmDeleteTimer.current) {
        clearTimeout(confirmDeleteTimer.current);
        confirmDeleteTimer.current = null;
      }
    }
  }, [isActive, confirmingDelete]);

  const startEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setEditValue(thread.title);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== thread.title && onRename) {
      onRename(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
  };

  // Long-press to rename (mobile only)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMobile || !onRename) return;
    longPressStartPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressStartPos.current = null;
      startEdit();
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStartPos.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressStartPos.current) return;
    const dx = Math.abs(e.clientX - longPressStartPos.current.x);
    const dy = Math.abs(e.clientY - longPressStartPos.current.y);
    if (dx > 8 || dy > 8) cancelLongPress();
  };

  // Delete with inline confirmation on mobile, direct on desktop
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) {
      if (!confirmingDelete) {
        setConfirmingDelete(true);
        confirmDeleteTimer.current = setTimeout(() => {
          setConfirmingDelete(false);
          confirmDeleteTimer.current = null;
        }, 3000);
      } else {
        if (confirmDeleteTimer.current) {
          clearTimeout(confirmDeleteTimer.current);
          confirmDeleteTimer.current = null;
        }
        setConfirmingDelete(false);
        onDelete(e);
      }
    } else {
      onDelete(e);
    }
  };

  if (editing) {
    return (
      <li>
        <div className="flex items-center gap-2 rounded-lg bg-white/8 border border-primary/30 px-2 py-2">
          <MessageSquareText className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none border-b border-primary/40 focus:border-primary pb-px"
            maxLength={120}
            aria-label="Rename thread"
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg cursor-pointer transition-colors min-h-[44px] sm:min-h-0',
          isActive
            ? 'bg-white/10 text-white'
            : 'hover:bg-white/5 active:bg-white/8 text-white/75 hover:text-white'
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onRename && !isMobile ? startEdit : undefined}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelLongPress}
          onPointerMove={handlePointerMove}
          onPointerCancel={cancelLongPress}
          className="flex-1 min-w-0 text-left flex items-start gap-2 px-2 py-2.5 sm:py-2 touch-manipulation select-none"
          title={isMobile ? (onRename ? 'Hold to rename' : undefined) : (onRename ? 'Double-click to rename' : undefined)}
        >
          <MessageSquareText
            className={cn(
              'h-3.5 w-3.5 flex-shrink-0 mt-0.5',
              isActive ? 'text-primary' : 'text-white/30 group-hover:text-white/50'
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug truncate font-medium">
              {thread.title || 'New chat'}
            </p>
            {thread.subtitle && (
              <p className="text-[9px] text-white/45 truncate mt-px">{thread.subtitle}</p>
            )}
            {thread.dominantEntities && thread.dominantEntities.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {thread.dominantEntities.slice(0, 3).map((entity) => (
                  <span
                    key={entity}
                    className="text-[8px] leading-none px-1 py-0.5 rounded bg-white/6 text-white/35 truncate max-w-[5rem]"
                  >
                    {entity}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-white/30 mt-0.5">{formatTimestamp(thread.updatedAt)}</p>
          </div>
        </button>

        {/* Actions */}
        <div className={cn(
          'flex items-center flex-shrink-0 mr-1',
          isMobile ? 'gap-0' : 'gap-0 opacity-0 group-hover:opacity-100'
        )}>
          {onRename && !isMobile && (
            <button
              type="button"
              onClick={startEdit}
              className="p-1.5 rounded text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors touch-manipulation"
              aria-label="Rename thread"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteClick}
            className={cn(
              'transition-all touch-manipulation rounded',
              isMobile
                ? confirmingDelete
                  ? 'flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-500/20 border border-red-500/40 min-h-[36px]'
                  : 'p-2 text-white/25 hover:text-red-400 hover:bg-red-500/10'
                : 'p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10'
            )}
            aria-label={confirmingDelete ? 'Confirm delete' : 'Delete thread'}
          >
            {confirmingDelete ? (
              <>
                <Trash2 className="h-3 w-3" />
                <span>Delete?</span>
              </>
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const ChatThreadList = ({
  threads,
  currentThreadId,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  collapsed,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileClose,
  isMobile = false,
}: ChatThreadListProps) => {
  const drawerSwipeStartX = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewChat = () => {
    setSearchQuery('');
    onNewChat();
    onMobileClose?.();
  };

  const handleSelectThread = (id: string) => {
    setSearchQuery('');
    onSelectThread(id);
    onMobileClose?.();
  };

  const filteredThreads = searchQuery.trim()
    ? threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : threads;

  const groups = groupThreadsByDate(filteredThreads);

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center gap-1 p-2 border-b border-white/8 flex-shrink-0 min-h-[52px] sm:min-h-[44px]">
        {isMobile && (
          <button
            type="button"
            onClick={onMobileClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors touch-manipulation flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-2 flex-1 min-w-0 rounded-lg bg-white/8 hover:bg-white/12 active:bg-white/15 text-white px-3 py-2.5 sm:px-2.5 sm:py-1.5 min-h-[44px] sm:min-h-0 text-sm font-medium transition-colors touch-manipulation border border-white/10"
          >
            <MessageSquarePlus className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="truncate">New chat</span>
          </button>
        )}
        {!isMobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/8 transition-colors touch-manipulation flex-shrink-0"
            aria-label={collapsed ? 'Expand thread list' : 'Collapse thread list'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-white/6 flex-shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25 pointer-events-none" />
            <input
              type="text"
              placeholder="Search chats…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/12 rounded-lg pl-9 pr-8 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-black/60 focus:ring-1 focus:ring-primary/20 transition-all"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Thread list */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden chat-scrollbar py-2 min-h-0 overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {collapsed && !isMobile ? (
          /* Collapsed icon-only view */
          <div className="flex flex-col items-center gap-1 px-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/8 touch-manipulation"
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
                    : 'text-white/40 hover:text-white hover:bg-white/8'
                )}
              >
                <MessageSquareText className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquareText className="h-8 w-8 text-white/15 mx-auto mb-3" />
            {searchQuery ? (
              <p className="text-xs text-white/30">No chats match &ldquo;{searchQuery}&rdquo;</p>
            ) : (
              <>
                <p className="text-xs text-white/30">No conversations yet</p>
                <p className="text-[10px] text-white/20 mt-1">Start a new chat to begin</p>
              </>
            )}
          </div>
        ) : (
          /* Grouped thread list */
          <div className="space-y-4 px-2 pb-2">
            {groups.map(({ label, threads: groupThreads }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 px-2 mb-1">
                  {label}
                </p>
                <ul className="space-y-0.5">
                  {groupThreads.map((t) => (
                    <ThreadItem
                      key={t.id}
                      thread={t}
                      isActive={currentThreadId === t.id}
                      isMobile={isMobile}
                      onSelect={() => handleSelectThread(t.id)}
                      onDelete={(e) => onDeleteThread(t.id, e)}
                      onRename={onRenameThread ? (newTitle) => onRenameThread(t.id, newTitle) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile footer hint */}
      {isMobile && threads.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-white/6">
          <p className="text-[10px] text-white/20 text-center">Hold a chat to rename it</p>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 sm:hidden',
            mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onMobileClose}
          aria-hidden
        />
        {/* Left-side drawer */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] flex flex-col border-r border-white/10 bg-[#0a0a0a] sm:hidden transition-transform duration-250 ease-out will-change-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top, 0)',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
            paddingLeft: 'env(safe-area-inset-left, 0)',
            minHeight: '100dvh',
            maxHeight: '100dvh',
          }}
          onTouchStart={(e) => {
            drawerSwipeStartX.current = e.touches[0].clientX;
          }}
          onTouchMove={(e) => {
            if (drawerSwipeStartX.current === null) return;
            const dx = drawerSwipeStartX.current - e.touches[0].clientX;
            if (dx > 60) {
              onMobileClose?.();
              drawerSwipeStartX.current = null;
            }
          }}
          onTouchEnd={() => {
            drawerSwipeStartX.current = null;
          }}
        >
          {content}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        'hidden sm:flex flex-col border-r border-white/8 bg-black/50 flex-shrink-0 transition-[width] duration-200 overflow-hidden',
        collapsed ? 'w-12' : 'w-56 sm:w-64'
      )}
    >
      {content}
    </div>
  );
};
