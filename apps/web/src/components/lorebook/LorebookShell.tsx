import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Sparkles, Library, Edit3, BookOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  isLorebookLibraryRoute,
  lorebookEditorUrlForCompiledBooks,
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
        : 'LoreBooks';

  const editorUrl = lorebookEditorUrlForCompiledBooks(compiledBooks);

  const tabs: Array<{
    id: LorebookNavTab;
    label: string;
    icon: typeof Sparkles;
    onClick: () => void;
    hidden?: boolean;
  }> = [
    {
      id: 'generate',
      label: 'Generate',
      icon: Sparkles,
      onClick: () => navigate('/lorebook'),
    },
    {
      id: 'library',
      label: 'Library',
      icon: Library,
      onClick: () => navigate('/lorebook/library'),
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

  return (
    <LorebookShellContext.Provider value={true}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* Hub header — reader uses LoreBook&apos;s own top bar */}
        {!isReading && (
          <header
            className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-3 backdrop-blur-md lg:hidden"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)', paddingBottom: '10px' }}
          >
            <div className="flex min-w-0 items-center gap-1">
              {onOpenAppSidebar && (
                <button
                  type="button"
                  onClick={onOpenAppSidebar}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg active:bg-white/10 touch-manipulation"
                  aria-label="Open app menu"
                >
                  <Menu className="h-5 w-5 text-white/55" />
                </button>
              )}
              <h1 className="truncate text-base font-semibold text-white">{headerTitle}</h1>
            </div>
          </header>
        )}

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {children}
        </div>

        {/* Route switcher — hidden while reading (reader has its own chrome) */}
        {!isReading && (
        <nav
          className="z-10 shrink-0 border-t border-white/10 bg-black/95 backdrop-blur-md lg:hidden"
          style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
          aria-label="LoreBooks navigation"
        >
          <div className="flex items-stretch px-1 pt-1">
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
                      active ? 'text-primary' : 'text-white/40 active:text-white/65',
                      tab.id === 'read' && 'pointer-events-none',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                        active && 'bg-primary/20',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          active && 'drop-shadow-[0_0_10px_rgba(168,85,247,0.45)]',
                        )}
                      />
                    </span>
                    <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                  </button>
                );
              })}
          </div>
        </nav>
        )}
      </div>
    </LorebookShellContext.Provider>
  );
}
