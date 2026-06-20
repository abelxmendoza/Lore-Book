// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { PlusCircle, Menu } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { config } from '../config/env';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setActiveSurface as setActiveSurfaceAction,
  setMobileDrawerOpen,
  toggleDevMode,
  setDevMode as setDevModeAction,
} from '../store/slices/uiSlice';
import {
  setChatFocus,
  emptyChatFocusSessionStats,
} from '../store/slices/selectionSlice';
import type { ChatFocus } from '../types/chatFocus';

import { AuthGate } from '../components/AuthGate';
import { SkipLink } from '../components/SkipLink';
import { AgentPanel } from '../components/AgentPanel';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/supabase';
import { useLoreKeeper } from '../hooks/useLoreKeeper';
import { useTaskEngine } from '../hooks/useTaskEngine';
import { Footer } from '../components/Footer';
import { MockDataToggle } from '../components/settings/MockDataToggle';
import { useMockData } from '../contexts/MockDataContext';
import { ChatFirstInterface } from '../features/chat/components/ChatFirstInterface';
import { ConversationPersistenceInspector } from '../features/chat/components/ConversationPersistenceInspector';
import { CharacterBook } from '../components/characters/CharacterBook';
import { LocationBook } from '../components/locations/LocationBook';
import { ProjectBook } from '../components/projects/ProjectBook';
import { PhotoAlbum } from '../components/photos/PhotoAlbum';
import { BiographyEditor } from '../components/biography/BiographyEditor';
import { LoreBook } from '../components/lorebook/LoreBook';
import { LorebookLibraryPage } from '../components/lorebook/LorebookLibraryPage';
import { LorebookShell } from '../components/lorebook/LorebookShell';
import { OmniTimeline } from '../components/timeline/OmniTimeline';
import UserGuide from '../components/guide/UserGuide';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { PerceptionsView } from '../components/perceptions/PerceptionsView';
import { TrialBanner } from '../components/subscription/TrialBanner';
import { PricingPage } from '../components/subscription/PricingPage';
import { ModeBadge } from '../components/ModeBadge';
import { PrivacySecurityPage } from '../components/security/PrivacySecurityPage';
import { EventsBook } from '../components/events/EventsBook';
import { IntelligenceDashboard } from '../components/diagnostics/IntelligenceDashboard';
import { EntityResolutionBook } from '../components/entities/EntityResolutionBook';
import { OrganizationsBook } from '../components/organizations/OrganizationsBook';
import { FamilyBook } from '../components/family/FamilyBook';
import { DocumentsBook } from '../components/documents/DocumentsBook';
import { SkillsBook } from '../components/skills/SkillsBook';
import { PrivacySettings } from '../components/security/PrivacySettings';
import { PrivacyPolicy } from '../components/security/PrivacyPolicy';
import { DiscoveryHub } from '../components/discovery/DiscoveryHub';
import { GuestBanner } from '../components/guest/GuestBanner';
import { DemoModeBanner } from '../components/DemoModeBanner';
import { DemoModeBootstrap } from '../components/DemoModeBootstrap';
import { LoveAndRelationshipsView } from '../components/love/LoveAndRelationshipsView';
import { QuestBoard } from '../components/quests/QuestBoard';
import { KnowledgeGapDashboard } from '../components/voids/KnowledgeGapDashboard';
import { SagaScreen } from '../components/saga/SagaScreen';
import { ContinuityDashboard } from '../components/continuity/ContinuityDashboard';
import { HomeScreen } from '../components/HomeScreen';
import { PhotoGallery } from '../components/PhotoGallery';
import { getSurfaceFromRoute, getRouteFromSurface, type SurfaceKey } from '../utils/routeMapping';
import { isLorebookLibraryRoute } from '../lib/lorebookLibrary';
import { scrollToTop } from '../lib/scrollToTop';



interface AppContentProps {
  defaultSurface?: SurfaceKey;
}

const AppContent = ({ defaultSurface: _defaultSurface }: AppContentProps) => {
  const { user } = useAuth();
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
  const dispatch = useAppDispatch();
  const reduxActiveSurface = useAppSelector((s) => s.ui.activeSurface);
  const activeSurface = useMemo(
    () => getSurfaceFromRoute(location.pathname),
    [location.pathname]
  );
  const isMobileDrawerOpen = useAppSelector((s) => s.ui.mobileDrawerOpen);
  const devMode = useAppSelector((s) => s.ui.devMode);
  const setActiveSurface = useCallback(
    (surface: SurfaceKey) => navigate(getRouteFromSurface(surface)),
    [navigate]
  );
  const setIsMobileDrawerOpen = useCallback(
    (open: boolean) => dispatch(setMobileDrawerOpen(open)),
    [dispatch]
  );
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);

  // Keep Redux in sync with URL (for selectors, e2e, keyboard shortcuts)
  useLayoutEffect(() => {
    if (activeSurface !== reduxActiveSurface) {
      dispatch(setActiveSurfaceAction(activeSurface));
    }
  }, [activeSurface, reduxActiveSurface, dispatch]);

  // Mobile + book surfaces scroll inside <main> and nested panels — reset on route change.
  useLayoutEffect(() => {
    scrollToTop({ mainEl: mainContentRef.current });
  }, [location.pathname, location.search]);

  // Listen for navigation events from subscription components
  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail?.surface) {
        navigate(getRouteFromSurface(e.detail.surface as SurfaceKey));
      }
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, [navigate]);

  // Modal → main chat with entity focus (love, characters, projects, etc.)
  useEffect(() => {
    const openChat = (focus?: ChatFocus | null, prefill?: string) => {
      if (focus || prefill) {
        const base: ChatFocus =
          focus ??
          ({
            entityId: 'lorebook',
            entityName: 'Your story',
            entityType: 'memory',
            sourceSurface: 'lorebook',
            sourceLabel: 'Lorebooks',
            sessionStats: emptyChatFocusSessionStats(),
          } as ChatFocus);
        dispatch(
          setChatFocus({
            ...base,
            initialPrompt: prefill ?? base.initialPrompt,
            sessionStats: base.sessionStats ?? emptyChatFocusSessionStats(),
          })
        );
      }
      navigate('/chat');
    };

    const handleOpenChatFocus = (e: CustomEvent<ChatFocus>) => {
      openChat(e.detail);
    };

    const handleNavigateSurface = (e: CustomEvent<{ surface?: SurfaceKey; context?: string; focus?: ChatFocus }>) => {
      const { surface, context, focus } = e.detail ?? {};
      if (surface === 'chat' || focus) {
        openChat(focus ?? null, context);
        return;
      }
      if (surface) {
        navigate(getRouteFromSurface(surface));
      }
    };

    const handleChatPrefill = (e: CustomEvent<{ message?: string }>) => {
      const message = e.detail?.message;
      if (message) openChat(null, message);
    };

    window.addEventListener('lorebook:open-chat-focus', handleOpenChatFocus as EventListener);
    window.addEventListener('navigate-surface', handleNavigateSurface as EventListener);
    window.addEventListener('lorebook:chat-prefill', handleChatPrefill as EventListener);
    return () => {
      window.removeEventListener('lorebook:open-chat-focus', handleOpenChatFocus as EventListener);
      window.removeEventListener('navigate-surface', handleNavigateSurface as EventListener);
      window.removeEventListener('lorebook:chat-prefill', handleChatPrefill as EventListener);
    };
  }, [dispatch, navigate]);

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

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      meta: true,
      handler: () => {
        navigate('/timeline?view=search');
        setTimeout(() => {
          const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
          searchInput?.focus();
        }, 100);
      },
      description: 'Open timeline search'
    },
    {
      key: 'n',
      meta: true,
      handler: () => {
        // Navigate to chatbot where entries can be created
        navigate('/chat');
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
    navigate('/chat');
    // Try to focus on chat input if it exists
    setTimeout(() => {
      const textarea = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="chat" i]') as HTMLTextAreaElement;
      textarea?.focus();
      textarea?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // Viewport-locked surfaces (chat/lorebook/memoir/saga/timeline) manage their own scroll.
  const VIEWPORT_LOCKED_SURFACES = new Set<SurfaceKey>([
    'chat',
    'lorebook',
    'memoir',
    'saga',
    'timeline',
    'discovery',
    'quests',
  ]);
  const isViewportLocked = VIEWPORT_LOCKED_SURFACES.has(activeSurface);
  const isHome = activeSurface === 'home';
  const isGuide = activeSurface === 'guide';
  /** Book-style pages scroll inside <main> so the demo banner does not clip content. */
  const isBookScrollSurface = !isViewportLocked && !isHome;

  const getSurfaceName = (surface: SurfaceKey): string => {
    const names: Record<SurfaceKey, string> = {
      home: 'Home',
      chat: 'Chat',
      timeline: 'Omni Timeline',
      characters: 'Characters',
      locations: 'Locations',
      memoir: 'LoreBook Editor',
      lorebook: 'Lorebooks',
      photos: 'Photo Album',
      perceptions: 'Perceptions',
      events: 'Life Log',
      entities: 'Entities',
      organizations: 'Groups & Organizations',
      family: 'Family',
      skills: 'Skills',
      projects: 'Projects',
      subscription: 'Subscription',
      pricing: 'Pricing',
      security: 'Privacy & Security',
      'privacy-settings': 'Privacy Settings',
      'privacy-policy': 'Privacy Policy',
      discovery: 'Discovery Hub',
      continuity: 'Continuity',
      guide: 'User Guide',
      love: 'Love & Relationships',
      quests: 'Quests',
      gaps: 'Knowledge Gaps',
      saga: 'Life Saga',
      documents: 'Documents',
      intelligence: 'Intelligence Health',
    };
    return names[surface] || 'Lore Book';
  };

  return (
    <div
      className={`flex bg-gradient-to-br from-black via-purple-950 to-black ${activeSurface === 'timeline' ? 'min-h-screen' : 'min-h-screen'}`}
      style={{ 
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)'
      }}
    >
      <SkipLink />
      <DemoModeBootstrap />

      {/* Mobile Header — hidden in surfaces with their own top bars */}
      <header className={`fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border/60 bg-black/80 backdrop-blur-lg px-4 py-3 lg:hidden${(activeSurface === 'chat' || activeSurface === 'lorebook' || activeSurface === 'memoir' || activeSurface === 'saga' || activeSurface === 'timeline' || activeSurface === 'discovery' || activeSurface === 'quests') ? ' hidden' : ''}`} style={{ paddingTop: 'env(safe-area-inset-top, 0.75rem)' }}>
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
        onToggleDevMode={() => dispatch(toggleDevMode())}
        devModeEnabled={devMode}
        isMobileDrawerOpen={isMobileDrawerOpen}
        onMobileDrawerClose={() => setIsMobileDrawerOpen(false)}
      />
      {/* Shell: viewport-locked surfaces fill the screen; book pages scroll inside main. */}
      <div
        className={`flex-1 flex flex-col min-h-0 ${
          isViewportLocked || isBookScrollSurface ? 'h-screen overflow-hidden' : 'min-h-screen'
        }`}
      >
      <DemoModeBanner />
      <main
        ref={mainContentRef}
        id="main-content"
        className={`flex-1 min-h-0 text-white overflow-x-hidden flex flex-col ${
          isViewportLocked
            ? 'p-0 overflow-hidden'
            : isHome || isGuide
              ? 'p-0 pt-14 lg:pt-0 overflow-y-auto'
              : 'overflow-y-auto space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10 pt-16 sm:pt-6'
        }`}
        role="main"
        style={
          isViewportLocked
            ? undefined
            : isHome
              ? { minHeight: '100vh', overflowY: 'auto' }
              : undefined
        }
      >
        {activeSurface !== 'chat' && activeSurface !== 'home' && activeSurface !== 'guide' && activeSurface !== 'memoir' && activeSurface !== 'lorebook' && activeSurface !== 'saga' && activeSurface !== 'timeline' && activeSurface !== 'discovery' && activeSurface !== 'quests' && (
          <>
            <header className="hidden lg:flex items-center justify-between rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-4 shadow-panel">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold">Welcome back</h1>
                <p className="text-xs sm:text-sm text-white/60">Your timelines and views reflect what you&apos;ve shared in Chat.</p>
                <p className="text-xs sm:text-sm text-white/50 mt-0.5">{entries.length} memories · {chapters.length} chapters</p>
              </div>
            </header>

            <GuestBanner />
            <TrialBanner />
          </>
        )}

        {activeSurface === 'home' && <HomeScreen />}
        {activeSurface === 'chat' && (
          <div className="fixed inset-0 lg:relative lg:inset-auto h-full w-full overflow-hidden">
            <ChatFirstInterface onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
        {activeSurface === 'timeline' && (
          <div className="fixed inset-0 z-10 lg:relative lg:inset-auto lg:z-auto h-full w-full overflow-hidden">
            <OmniTimeline onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
        {activeSurface === 'characters' && <CharacterBook />}
        {activeSurface === 'locations' && <LocationBook />}
        {activeSurface === 'projects' && <ProjectBook />}
        {activeSurface === 'memoir' && (
          <div className="fixed inset-0 lg:relative lg:inset-auto h-full w-full overflow-hidden">
            <BiographyEditor onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
                        {activeSurface === 'lorebook' && (
                          <div className="fixed inset-0 lg:relative lg:inset-auto h-full w-full overflow-hidden">
                            <LorebookShell onOpenAppSidebar={() => setIsMobileDrawerOpen(true)}>
                              {isLorebookLibraryRoute(location.pathname) ? (
                                <LorebookLibraryPage onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
                              ) : (
                                <LoreBook onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
                              )}
                            </LorebookShell>
                          </div>
                        )}
                        {activeSurface === 'photos' && (
                          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6 space-y-6">
                            <PhotoGallery />
                            <PhotoAlbum />
                          </div>
                        )}
                        {/* Memories now live inside the Life Log surface. */}
                        {activeSurface === 'perceptions' && (
                          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-x-hidden overflow-y-auto p-3 sm:p-6 min-w-0">
                            <PerceptionsView showCreateButton={true} />
                          </div>
                        )}

                        {activeSurface === 'events' && <EventsBook />}
                        {activeSurface === 'intelligence' && <IntelligenceDashboard />}
                        {activeSurface === 'entities' && <EntityResolutionBook />}
                        {activeSurface === 'organizations' && <OrganizationsBook />}
                        {activeSurface === 'family' && <FamilyBook />}
                        {activeSurface === 'documents' && <DocumentsBook />}
                        {activeSurface === 'skills' && <SkillsBook />}
                        {activeSurface === 'subscription' && (
          <div className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] p-4 sm:p-6">
            <TrialBanner />
            <SubscriptionManagement />
          </div>
        )}
        {activeSurface === 'pricing' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto">
            <PricingPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'security' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacySecurityPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'privacy-settings' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacySettings onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'privacy-policy' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <PrivacyPolicy onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'discovery' && (
          <div className="fixed inset-0 lg:relative lg:inset-auto h-full w-full overflow-hidden lg:rounded-2xl lg:border lg:border-border/60 lg:bg-black/40 lg:shadow-panel">
            <DiscoveryHub onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
        {activeSurface === 'love' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <LoveAndRelationshipsView />
          </div>
        )}
        {activeSurface === 'quests' && (
          <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-1 min-h-0 h-full w-full overflow-hidden">
            <QuestBoard onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
                        {activeSurface === 'gaps' && (
                          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto">
                            <KnowledgeGapDashboard />
                          </div>
                        )}
        {activeSurface === 'guide' && <UserGuide />}
        {activeSurface === 'saga' && (
          <div className="fixed inset-0 lg:relative lg:inset-auto h-full w-full overflow-hidden">
            <SagaScreen onOpenAppSidebar={() => setIsMobileDrawerOpen(true)} />
          </div>
        )}
        {activeSurface === 'continuity' && (
          <div data-route-scroll-root className="rounded-lg sm:rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-8rem)] sm:min-h-[calc(100vh-4rem)] overflow-auto p-4 sm:p-6">
            <ContinuityDashboard />
          </div>
        )}

        {/* Hide dev mode panel in production and timeline view */}
        {!config.env.isProduction && devMode && activeSurface !== 'timeline' && (
          <div className="space-y-4 rounded-lg sm:rounded-2xl border border-primary/40 bg-black/40 p-4 shadow-panel mb-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-primary/70">Developer Diagnostics</p>
                <p className="text-xs sm:text-sm text-white/70">Raw fabric edges, agent logs, and embedding inspector.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => dispatch(setDevModeAction(false))}>
                Hide
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AgentPanel />
            </div>
            {/* Mock data toggle only for demo/guest; hidden when logged into your account */}
            {!user && (
              <div className="mt-4">
                <MockDataToggle />
              </div>
            )}
          </div>
        )}

        {activeSurface !== 'chat' && activeSurface !== 'quests' && (
          <div className="hidden sm:flex fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 flex flex-col gap-2">
            <Button size="lg" leftIcon={<PlusCircle className="h-4 w-4" />} onClick={navigateToChat} className="shadow-lg">
              <span className="hidden sm:inline">+ New Entry</span>
              <span className="sm:hidden">+</span>
            </Button>
          </div>
        )}
        <CreateChapterModal
          open={chapterModalOpen}
          onClose={() => setChapterModalOpen(false)}
          onCreate={async (payload) => {
            const chapter = await createChapter(payload);
            await Promise.all([refreshTimeline(), refreshChapters()]);
            return chapter;
          }}
        />

        {!VIEWPORT_LOCKED_SURFACES.has(activeSurface) && <Footer />}
      </main>
      </div>
      <ModeBadge />
      {import.meta.env.DEV && <ConversationPersistenceInspector />}
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
