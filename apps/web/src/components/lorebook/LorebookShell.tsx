import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Sparkles, Library, Edit3, BookOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  isLorebookLibraryRoute,
  lorebookEditorUrlForCompiledBooks,
  lorebookLibraryUrl,
} from '../../lib/lorebookLibrary';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';

type LorebookNavTab = 'generate' | 'library' | 'editor' | 'read';

const LorebookShellContext = createContext(false);

export function useLorebookShell(): boolean {
  return useContext(LorebookShellContext);
}

type LorebookShellProps = {
  children: ReactNode;
  onOpenAppSidebar?: () => void;
};

function resolveActiveTab(pathname: string, search: string): LorebookNavTab {
  if (isLorebookLibraryRoute(pathname)) return 'library';
  const params = new URLSearchParams(search);
  if (params.get('book')) return 'read';
  if (pathname.startsWith('/memoir')) return 'editor';
  return 'generate';
}

export function LorebookShell({ children, onOpenAppSidebar }: LorebookShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { compiledBooks } = useLoreReadiness();

  const activeTab = useMemo(
    () => resolveActiveTab(location.pathname, location.search),
    [location.pathname, location.search],
  );

  const isReading = activeTab === 'read';
  const headerTitle =
    activeTab === 'library'
      ? 'Your library'
      : activeTab === 'read'
        ? 'Reading'
        : activeTab === 'editor'
          ? 'Editor'
          : 'Create';

  const editorUrl = lorebookEditorUrlForCompiledBooks(compiledBooks);

  const tabs: Array<{
    id: LorebookNavTab;
    label: string;
    icon: typeof Sparkles;
    onClick: () => void;
    hidden?: boolean;
  }> = [
    {
      id: 'library',
      label: 'Library',
      icon: Library,
      onClick: () => navigate(lorebookLibraryUrl()),
    },
    {
      id: 'generate',
      label: 'Create',
      icon: Sparkles,
      onClick: () => navigate('/lorebook'),
    },
    {
      id: 'editor',
      label: 'Editor',
      icon: Edit3,
      onClick: () => navigate(editorUrl),
    },
    {
      id: 'read',
      label: 'Read',
      icon: BookOpen,
      onClick: () => {},
      hidden: !isReading,
    },
  ];

  const nav = (
    <div className="flex items-stretch px-1 pt-1 lg:px-0 lg:pt-0 lg:gap-1">
      {tabs
        .filter((tab) => !tab.hidden)
        .map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              disabled={tab.id === 'read'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 touch-manipulation transition-colors',
                'lg:min-h-0 lg:flex-none lg:flex-row lg:gap-2 lg:rounded-lg lg:px-3 lg:py-2 lg:text-sm',
                active ? 'text-primary lg:bg-primary/15' : 'text-white/40 active:text-white/65 lg:hover:bg-white/5 lg:hover:text-white/70',
                tab.id === 'read' && 'pointer-events-none',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl transition-colors lg:h-auto lg:w-auto lg:rounded-none lg:bg-transparent',
                  active && 'bg-primary/20 lg:bg-transparent',
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 lg:h-4 lg:w-4',
                    active && 'drop-shadow-[0_0_10px_rgba(168,85,247,0.45)] lg:drop-shadow-none',
                  )}
                />
              </span>
              <span className="text-[10px] font-medium leading-none lg:text-sm">{tab.label}</span>
            </button>
          );
        })}
    </div>
  );

  return (
    <LorebookShellContext.Provider value={true}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {!isReading && (
          <header
            className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-3 backdrop-blur-md"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)', paddingBottom: '10px' }}
          >
            <div className="flex min-w-0 items-center gap-1 lg:gap-3">
              {onOpenAppSidebar && (
                <button
                  type="button"
                  onClick={onOpenAppSidebar}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:bg-white/10 touch-manipulation lg:hidden"
                  aria-label="Open app menu"
                >
                  <Menu className="h-5 w-5 text-white/55" />
                </button>
              )}
              <div className="min-w-0">
                <p className="hidden text-[10px] font-mono uppercase tracking-[0.16em] text-primary/70 lg:block">
                  LoreBooks
                </p>
                <h1 className="truncate text-base font-semibold text-white lg:text-lg">{headerTitle}</h1>
              </div>
            </div>
            <nav className="hidden lg:block" aria-label="LoreBooks navigation">
              {nav}
            </nav>
          </header>
        )}

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {children}
        </div>

        {!isReading && (
          <nav
            className="z-10 shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md lg:hidden"
            style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
            aria-label="LoreBooks navigation"
          >
            {nav}
          </nav>
        )}
      </div>
    </LorebookShellContext.Provider>
  );
}
