import { useEffect, useRef, useState, useMemo } from 'react';
import { MessageSquarePlus, MessageSquareText, Pencil, Trash2, PanelLeftClose, PanelLeft, X, Search, Brain, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { ChatThread } from '../hooks/useChatThreads';
import { isGenericThreadTitle, resolveThreadDisplayTitle } from '../utils/threadTitleUtils';
import { disambiguateThreadTitles } from '../utils/threadDedupeUtils';
import { useThreadExplorer } from '../hooks/useThreadExplorer';
import type { ThreadExploreHit } from '../../../api/threadExplorer';

type ChatThreadListProps = {
  threads: ChatThread[];
  currentThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string, options?: { messageId?: string; messageIndex?: number }) => void;
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
  displayTitle,
  isActive,
  isMobile,
  onSelect,
  onDelete,
  onRename,
  exploreHit,
}: {
  thread: ChatThread;
  displayTitle: string;
  isActive: boolean;
  isMobile: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename?: (newTitle: string) => void;
  exploreHit?: ThreadExploreHit;
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
    if (trimmed && trimmed !== thread.title && !isGenericThreadTitle(trimmed) && onRename) {
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
    <li className="relative">
      {/* Active left-edge indicator bar */}
      {isActive && (
        <span
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary"
          aria-hidden
        />
      )}
      <div
        className={cn(
          'group flex items-center gap-1 rounded-lg cursor-pointer transition-colors min-h-[44px] sm:min-h-0',
          isActive
            ? 'bg-primary/[0.13] text-white'
            : 'hover:bg-white/[0.06] active:bg-white/[0.08] text-white/55 hover:text-white/90'
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
              isActive ? 'text-primary' : 'text-white/25 group-hover:text-white/55'
            )}
          />
          <div className="min-w-0 flex-1">
            <p className={cn(
              'text-sm leading-snug truncate',
              isActive ? 'font-semibold' : 'font-medium'
            )}>
              {displayTitle}
            </p>
            {thread.subtitle && (
              <p className={cn(
                'text-[9px] truncate mt-px',
                isActive ? 'text-white/60' : 'text-white/35'
              )}>{thread.subtitle}</p>
            )}
            {thread.dominantEntities && thread.dominantEntities.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {thread.dominantEntities.slice(0, 3).map((entity) => (
                  <span
                    key={entity}
                    className={cn(
                      'text-[8px] leading-none px-1 py-0.5 rounded truncate max-w-[5rem]',
                      isActive ? 'bg-primary/20 text-primary/80' : 'bg-white/6 text-white/30'
                    )}
                  >
                    {entity}
                  </span>
                ))}
              </div>
            )}
            {exploreHit?.snippets[0] && (
              <p className="text-[10px] text-white/45 line-clamp-2 mt-0.5 leading-relaxed">
                {exploreHit.snippets[0].excerpt}
              </p>
            )}
            {exploreHit?.knowledge[0] && (
              <p className="text-[9px] text-indigo-300/65 line-clamp-1 mt-0.5 flex items-center gap-1">
                <Brain className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{exploreHit.knowledge[0].claim}</span>
              </p>
            )}
            {exploreHit?.matchReasons && exploreHit.matchReasons.length > 0 && exploreHit.matchReasons[0] !== 'recent' && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {exploreHit.matchReasons.slice(0, 3).map((reason) => (
                  <span
                    key={reason}
                    className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-200/70 border border-amber-500/15"
                  >
                    {reason.startsWith('entity:') ? reason.slice(7) : reason}
                  </span>
                ))}
              </div>
            )}
            <p className={cn(
              'text-[10px] mt-0.5',
              isActive ? 'text-white/50' : 'text-white/25'
            )}>{formatTimestamp(thread.updatedAt)}</p>
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
  const {
    hits: exploreHits,
    facets,
    entityFilter,
    setEntityFilter,
    loading: exploreLoading,
    active: exploreActive,
    clearFilters,
  } = useThreadExplorer(searchQuery, !collapsed);

  const handleNewChat = () => {
    setSearchQuery('');
    clearFilters();
    onNewChat();
    onMobileClose?.();
  };

  const handleSelectThread = (id: string, options?: { messageId?: string; messageIndex?: number }) => {
    setSearchQuery('');
    clearFilters();
    onSelectThread(id, options);
    onMobileClose?.();
  };

  const hitByThreadId = new Map(exploreHits.map(h => [h.threadId, h]));

  const displayThreads: ChatThread[] = exploreActive
    ? exploreHits.map(hit => {
        const existing = threads.find(t => t.id === hit.threadId);
        return existing ?? {
          id: hit.threadId,
          title: hit.title,
          subtitle: hit.subtitle,
          dominantEntities: hit.entities,
          messages: [],
          updatedAt: hit.updatedAt,
        };
      })
    : searchQuery.trim()
      ? threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : threads;

  const groups = groupThreadsByDate(displayThreads);
  const titleLabels = useMemo(
    () => disambiguateThreadTitles(displayThreads),
    [displayThreads]
  );

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
              placeholder="Search threads, people, knowledge…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/12 rounded-lg pl-9 pr-8 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-black/60 focus:ring-1 focus:ring-primary/20 transition-all"
            />
            {exploreLoading ? (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/60 animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); clearFilters(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {(facets?.entities?.length ?? 0) > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap max-h-16 overflow-y-auto chat-scrollbar">
              {facets!.entities.slice(0, 10).map(({ name }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setEntityFilter(entityFilter === name ? null : name)}
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-full border transition-colors',
                    entityFilter === name
                      ? 'bg-primary/20 text-primary border-primary/30'
                      : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20'
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {entityFilter && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-primary/80">
              <Sparkles className="h-3 w-3" />
              <span>Filtered by {entityFilter}</span>
              <button type="button" onClick={() => setEntityFilter(null)} className="text-white/40 hover:text-white ml-1">
                Clear
              </button>
            </div>
          )}
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
                    ? 'bg-primary/[0.13] text-primary ring-1 ring-primary/20'
                    : 'text-white/35 hover:text-white/80 hover:bg-white/[0.06]'
                )}
              >
                <MessageSquareText className="h-4 w-4" />
              </button>
            ))}
          </div>
        ) : displayThreads.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquareText className="h-8 w-8 text-white/15 mx-auto mb-3" />
            {searchQuery || entityFilter ? (
              <p className="text-xs text-white/30">No threads match your search</p>
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
                  {groupThreads.map((t) => {
                    const hit = hitByThreadId.get(t.id);
                    const topSnippet = hit?.snippets[0];
                    return (
                    <ThreadItem
                      key={t.id}
                      thread={t}
                      displayTitle={titleLabels.get(t.id) ?? resolveThreadDisplayTitle(t)}
                      isActive={currentThreadId === t.id}
                      isMobile={isMobile}
                      exploreHit={hit}
                      onSelect={() => handleSelectThread(t.id, {
                        messageId: topSnippet?.messageId,
                        messageIndex: topSnippet?.messageIndex,
                      })}
                      onDelete={(e) => onDeleteThread(t.id, e)}
                      onRename={onRenameThread ? (newTitle) => onRenameThread(t.id, newTitle) : undefined}
                    />
                    );
                  })}
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
