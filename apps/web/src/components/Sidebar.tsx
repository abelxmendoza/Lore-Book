import { BookMarked, CalendarDays, Compass, MessageSquareText, Plus, Search, Sparkles } from 'lucide-react';

import { Logo } from './Logo';
import { Button } from './ui/button';

interface SidebarProps {
  activeSurface?: 'notebook' | 'timeline' | 'search';
  onSurfaceChange?: (surface: 'notebook' | 'timeline' | 'search') => void;
  onCreateChapter?: () => void;
  onScrollToComposer?: () => void;
  onScrollToDiscovery?: () => void;
  onToggleDevMode?: () => void;
  devModeEnabled?: boolean;
}

export const Sidebar = ({
  activeSurface,
  onSurfaceChange,
  onCreateChapter,
  onScrollToComposer,
  onScrollToDiscovery,
  onToggleDevMode,
  devModeEnabled
}: SidebarProps) => (
  <aside className="hidden w-64 flex-col border-r border-border/60 bg-black/20 p-6 text-white lg:flex">
    <div className="mb-6">
      <Logo size="lg" showText={true} />
      <p className="mt-4 text-xs text-white/50">Cyberpunk journal with GPT-4 memory.</p>
    </div>
    <div className="mt-8 space-y-2">
      <button
        onClick={() => {
          onSurfaceChange?.('notebook');
          onScrollToComposer?.();
        }}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'notebook'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <MessageSquareText className="h-4 w-4 text-primary" />
        Neon Notebook
      </button>
      <button
        onClick={() => {
          onSurfaceChange?.('timeline');
        }}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'timeline'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <CalendarDays className="h-4 w-4 text-primary" />
        Omni Timeline
      </button>
      <button
        onClick={() => onSurfaceChange?.('search')}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'search'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Search className="h-4 w-4 text-primary" />
        HQI Explorer
      </button>
      <button
        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-white/70 transition hover:border-primary hover:bg-primary/10"
      >
        <BookMarked className="h-4 w-4 text-primary" />
        Chapters
      </button>
      <button
        onClick={() => {
          const chatPanel = document.querySelector('[data-chat-panel]');
          chatPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-white/70 transition hover:border-primary hover:bg-primary/10"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        Ask Lore Keeper
      </button>
      <button
        onClick={() => onScrollToDiscovery?.()}
        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-white/70 transition hover:border-primary hover:bg-primary/10"
      >
        <Compass className="h-4 w-4 text-primary" />
        Discovery Hub
      </button>
    </div>
    <div className="mt-auto">
      <div className="space-y-2">
        <Button className="w-full" leftIcon={<Plus className="h-4 w-4" />} onClick={onCreateChapter}>
          New Chapter
        </Button>
        <Button
          variant={devModeEnabled ? 'secondary' : 'outline'}
          className="w-full"
          onClick={onToggleDevMode}
          leftIcon={<Sparkles className="h-4 w-4" />}
        >
          {devModeEnabled ? 'Hide Dev Mode' : 'Dev Mode'}
        </Button>
      </div>
    </div>
  </aside>
);
