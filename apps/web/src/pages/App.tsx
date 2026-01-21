// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect } from 'react';
import { PlusCircle, Menu } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { config } from '../config/env';

import { AuthGate } from '../components/AuthGate';
import { SkipLink } from '../components/SkipLink';
import { AgentPanel } from '../components/AgentPanel';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { MemoryExplorer } from '../components/memory-explorer/MemoryExplorer';
import { TimelineSearch } from '../components/search/TimelineSearch';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';
import { useLoreKeeper } from '../hooks/useLoreKeeper';
import { useTaskEngine } from '../hooks/useTaskEngine';
import { Footer } from '../components/Footer';
import { MockDataToggle } from '../components/settings/MockDataToggle';
import { useMockData } from '../contexts/MockDataContext';
import { ChatFirstInterface } from '../features/chat/components/ChatFirstInterface';
import { CharacterBook } from '../components/characters/CharacterBook';
import { LocationBook } from '../components/locations/LocationBook';
import { PhotoAlbum } from '../components/photos/PhotoAlbum';
import { BiographyEditor } from '../components/biography/BiographyEditor';
import { LoreBook } from '../components/lorebook/LoreBook';
import { OmniTimelinePanel } from '../components/timeline/OmniTimelinePanel';
import UserGuide from '../components/guide/UserGuide';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { PerceptionsView } from '../components/perceptions/PerceptionsView';
import { TrialBanner } from '../components/subscription/TrialBanner';
import { PricingPage } from '../components/subscription/PricingPage';
import { PrivacySecurityPage } from '../components/security/PrivacySecurityPage';
import { EventsBook } from '../components/events/EventsBook';
import { EntityResolutionBook } from '../components/entities/EntityResolutionBook';
import { OrganizationsBook } from '../components/organizations/OrganizationsBook';
import { SkillsBook } from '../components/skills/SkillsBook';
import { PrivacySettings } from '../components/security/PrivacySettings';
import { PrivacyPolicy } from '../components/security/PrivacyPolicy';
import { DiscoveryHub } from '../components/discovery/DiscoveryHub';
import { GuestBanner } from '../components/guest/GuestBanner';
import { LoveAndRelationshipsView } from '../components/love/LoveAndRelationshipsView';
import { getSurfaceFromRoute } from '../utils/routeMapping';


type SurfaceKey = 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'photos' | 'memories' | 'events' | 'entities' | 'organizations' | 'skills' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity' | 'guide' | 'love';

interface AppContentProps {
  defaultSurface?: SurfaceKey;
}

const AppContent = ({ defaultSurface }: AppContentProps) => {
  console.log('[App] AppContent render start', { defaultSurface });
  
  const {
    entries,
    createChapter,
    chapters,
    refreshEntries,
    refreshTimeline,
    refreshChapters
  } = useLoreKeeper();
  const { useMockData: isMockDataEnabled } = useMockData();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSurface, setActiveSurface] = useState<SurfaceKey>(defaultSurface || 'chat');
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Sync route → surface (handles browser back/forward and direct navigation)
  useEffect(() => {
    const surfaceFromRoute = getSurfaceFromRoute(location.pathname);
    if (surfaceFromRoute !== activeSurface) {
      setActiveSurface(surfaceFromRoute);
    }
  }, [location.pathname]);

  // Also sync when defaultSurface prop changes (from route params)
  useEffect(() => {
    if (defaultSurface && defaultSurface !== activeSurface) {
      setActiveSurface(defaultSurface);
    }
  }, [defaultSurface]);

  // Listen for navigation events from subscription components
  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail?.surface) {
        setActiveSurface(e.detail.surface as SurfaceKey);
      }
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, []);

  // Refresh data when mock data toggle changes
  useEffect(() => {
    // Only refresh if we have the refresh functions available
    if (!refreshEntries || !refreshTimeline || !refreshChapters) return;
    
    const refreshAllData = async () => {
      try {
        // Clear any caches first
        if (typeof window !== 'undefined') {
          // Clear localStorage cache
          window.localStorage.removeItem('lorekeeper-cache');
        }
        
        // Refresh all data
        await Promise.all([
          refreshEntries(),
          refreshTimeline(),
          refreshChapters()
        ]);
        
        // Force a window event to notify other components
        window.dispatchEvent(new CustomEvent('mockDataToggled', { 
          detail: { enabled: isMockDataEnabled } 
        }));
      } catch (error) {
        console.error('Error refreshing data after mock toggle:', error);
      }
    };
    
    // Small delay to ensure state has updated
    const timeoutId = setTimeout(refreshAllData, 100);
    return () => clearTimeout(timeoutId);
  }, [isMockDataEnabled, refreshEntries, refreshTimeline, refreshChapters]);
  const [devMode, setDevMode] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      meta: true,
      handler: () => {
        navigate('/search');
        setActiveSurface('search');
        // Focus search input if it exists
        setTimeout(() => {
          const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
          searchInput?.focus();
        }, 100);
      },
      description: 'Open search'
    },
    {
      key: 'n',
      meta: true,
      handler: () => {
        // Navigate to chatbot where entries can be created
        navigate('/chat');
        setActiveSurface('chat');
        // Try to focus on chat input if it exists
        setTimeout(() => {
          const textarea = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="chat" i]') as HTMLTextAreaElement;
          textarea?.focus();
          textarea?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
      description: 'New entry'
    }
  ]);

  const navigateToChat = () => {
    // Navigate to chatbot where entries can be created
    navigate('/chat');
    setActiveSurface('chat');
    // Try to focus on chat input if it exists
    setTimeout(() => {
      const textarea = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="chat" i]') as HTMLTextAreaElement;
      textarea?.focus();
      textarea?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const renderSearchSurface = () => (
    <div className="h-full space-y-4 sm:space-y-6">
      <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold mb-2">Universal Timeline Search</h2>
          <p className="text-xs sm:text-sm text-white/60">Search across people, places, skills, jobs, projects, eras, and more</p>
        </div>
        <TimelineSearch />
      </div>
      <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-20rem)] sm:h-[calc(100vh-24rem)]">
        <MemoryExplorer />
      </div>
    </div>
  );

  console.log('[App] AppContent returning JSX', { activeSurface });
  
  // Get surface display name
  const getSurfaceName = (surface: SurfaceKey): string => {
    const names: Record<SurfaceKey, string> = {
      chat: 'Chat',
      timeline: 'Omni Timeline',
      search: 'Memory Explorer',
      characters: 'Characters',
      locations: 'Locations',
      memoir: 'Biography Editor',
      lorebook: 'Lore Book',
      photos: 'Photo Album',
      memories: 'Memories',
      events: 'Events',
      entities: 'Entities',
      organizations: 'Organizations',
      skills: 'Skills',
      subscription: 'Subscription',
      pricing: 'Pricing',
      security: 'Privacy & Security',
      'privacy-settings': 'Privacy Settings',
      'privacy-policy': 'Privacy Policy',
      discovery: 'Discovery Hub',
      continuity: 'Continuity',
      guide: 'User Guide',
      love: 'Love & Relationships'
    };
    return names[surface] || 'Lore Book';
  };

  return (
    <div 
      ref={(el) => {
        if (el && activeSurface === 'timeline') {
          // #region agent log
          const computedStyle = window.getComputedStyle(el);
          fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:253',message:'Root container height measured',data:{rootHeight:el.offsetHeight,rootStyleHeight:computedStyle.height,rootMinHeight:computedStyle.minHeight,viewportHeight:window.innerHeight,sidebarHeight:el.querySelector('aside')?.offsetHeight},timestamp:Date.now(),sessionId:'debug-session',runId:'height-debug',hypothesisId:'ROOT'})}).catch(()=>{});
          // #endregion
        }
      }}
      className={`flex bg-gradient-to-br from-black via-purple-950 to-black ${activeSurface === 'timeline' ? 'min-h-screen' : 'min-h-screen'}`}
      style={{ 
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)'
      }}
    >
      <SkipLink />
      
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border/60 bg-black/80 backdrop-blur-lg px-4 py-3 lg:hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0.75rem)' }}>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="text-white/70 hover:text-white"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Logo size="sm" showText={false} />
          <h1 className="text-lg font-semibold text-white">{getSurfaceName(activeSurface)}</h1>
        </div>
      </header>

      <Sidebar
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
        onToggleDevMode={() => setDevMode((prev) => !prev)}
        devModeEnabled={devMode}
        isMobileDrawerOpen={isMobileDrawerOpen}
        onMobileDrawerClose={() => setIsMobileDrawerOpen(false)}
      />
      <main 
        ref={(el) => {
          if (el && activeSurface === 'timeline') {
            // #region agent log
            const computedStyle = window.getComputedStyle(el);
            fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:262',message:'Main element dimensions measured',data:{mainHeight:el.offsetHeight,mainPaddingTop:computedStyle.paddingTop,mainPaddingBottom:computedStyle.paddingBottom,mainPadding:computedStyle.padding,headerHeight:el.querySelector('header')?.offsetHeight,viewportHeight:window.innerHeight,spaceY:computedStyle.gap},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
          }
        }}
        id="main-content" 
        className="flex-1 text-white overflow-x-hidden flex flex-col space-y-4 sm:space-y-6 p-4 sm:p-6 pt-16 sm:pt-6"
        role="main"
        style={activeSurface === 'timeline' ? { height: '100%', minHeight: '100%' } : {}}
      >
        <header className="hidden lg:flex items-center justify-between rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-4 shadow-panel">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Welcome back</h1>
            <p className="text-xs sm:text-sm text-white/60">{entries.length} memories · {chapters.length} chapters</p>
          </div>
        </header>

        <GuestBanner />
        <TrialBanner />

        {activeSurface === 'chat' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-8rem)] sm:h-[calc(100vh-12rem)]">
            <ChatFirstInterface />
          </div>
        )}
        {activeSurface === 'timeline' && <OmniTimelinePanel />}
        {activeSurface === 'search' && renderSearchSurface()}
        {activeSurface === 'characters' && <CharacterBook />}
        {activeSurface === 'locations' && <LocationBook />}
        {activeSurface === 'memoir' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-12rem)]">
            <BiographyEditor />
          </div>
        )}
                        {activeSurface === 'lorebook' && (
                          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)]">
                            <LoreBook />
                          </div>
                        )}
                        {activeSurface === 'photos' && (
                          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
                            <PhotoAlbum />
                          </div>
                        )}
                        {/* 'memories' surface removed - use 'search' for Memory Explorer */}
                        {activeSurface === 'perceptions' && (
                          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
                            <PerceptionsView showCreateButton={true} />
                          </div>
                        )}

                        {activeSurface === 'events' && <EventsBook />}
                        {activeSurface === 'entities' && <EntityResolutionBook />}
                        {activeSurface === 'organizations' && <OrganizationsBook />}
                        {activeSurface === 'skills' && <SkillsBook />}
                        {activeSurface === 'subscription' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] p-4 sm:p-6">
            <TrialBanner />
            <SubscriptionManagement />
          </div>
        )}
        {activeSurface === 'pricing' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto">
            <PricingPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'security' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacySecurityPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'privacy-settings' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacySettings onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'privacy-policy' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacyPolicy onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'discovery' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <DiscoveryHub />
          </div>
        )}
        {activeSurface === 'love' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <LoveAndRelationshipsView />
          </div>
        )}
        {activeSurface === 'guide' && <UserGuide />}

        {/* Hide dev mode panel in production and timeline view */}
        {!config.env.isProduction && devMode && activeSurface !== 'timeline' && (
          <div className="space-y-4 rounded-lg sm:rounded-2xl border border-primary/40 bg-black/40 p-4 shadow-panel mb-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-primary/70">Developer Diagnostics</p>
                <p className="text-xs sm:text-sm text-white/70">Raw fabric edges, agent logs, and embedding inspector.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDevMode(false)}>
                Hide
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AgentPanel />
            </div>
            <div className="mt-4">
              <MockDataToggle />
            </div>
          </div>
        )}

        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 flex flex-col gap-2">
          <Button size="lg" leftIcon={<PlusCircle className="h-4 w-4" />} onClick={navigateToChat} className="shadow-lg">
            <span className="hidden sm:inline">+ New Entry</span>
            <span className="sm:hidden">+</span>
          </Button>
        </div>
        <CreateChapterModal
          open={chapterModalOpen}
          onClose={() => setChapterModalOpen(false)}
          onCreate={async (payload) => {
            const chapter = await createChapter(payload);
            await Promise.all([refreshTimeline(), refreshChapters()]);
            return chapter;
          }}
        />

        <Footer />
      </main>
    </div>
  );
};

interface AppProps {
  defaultSurface?: SurfaceKey;
}

const App = ({ defaultSurface }: AppProps) => (
  <AppContent defaultSurface={defaultSurface} />
);

export default App;
