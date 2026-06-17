import { useEffect } from 'react';
import { BookMarked, CalendarDays, MessageSquareText, Search, Sparkles, Users, BookOpen, MapPin, Crown, Compass, Settings, UserCog, HelpCircle, Images, Eye, Calendar, Hash, Building2, Zap, X, Heart, Target, ExternalLink, Briefcase, TreePine, FileText, Shield } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { Logo } from './Logo';
import { Button } from './ui/button';
import { config } from '../config/env';
import { useAuth } from '../lib/supabase';
import { useAccountAuthority } from '../hooks/useAccountAuthority';
import { canAccessAdmin } from '../middleware/roleGuard';
import { cn } from '../lib/cn';
import { UserAvatarButton } from './UserAvatarButton';

import { surfaceToRoute, type SurfaceKey } from '../utils/routeMapping';
import { useEntityCounts } from '../hooks/useEntityCounts';

interface SidebarProps {
  activeSurface?: SurfaceKey;
  onSurfaceChange?: (surface: SurfaceKey) => void;
  onToggleDevMode?: () => void;
  devModeEnabled?: boolean;
  isMobileDrawerOpen?: boolean;
  onMobileDrawerClose?: () => void;
}

const SidebarContent = ({
  activeSurface,
  onSurfaceChange,
  onToggleDevMode,
  devModeEnabled,
  onMobileDrawerClose
}: Omit<SidebarProps, 'isMobileDrawerOpen'>) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { authority } = useAccountAuthority();
  const counts = useEntityCounts();

  const handleSurfaceChange = (surface: SurfaceKey) => {
    const route = surfaceToRoute[surface];
    if (route) {
      navigate(route);
    }
    onSurfaceChange?.(surface);
    // Close mobile drawer when navigating
    onMobileDrawerClose?.();
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userIsAdmin = canAccessAdmin(authority);

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="mb-6 hidden lg:block">
          {/* Logo — clicking returns to Home dashboard */}
          <button
            type="button"
            onClick={() => handleSurfaceChange('home')}
            className="block w-full text-left hover:opacity-80 transition-opacity"
            aria-label="Go to home"
          >
            <Logo size="lg" showText={true} />
          </button>
          <p className="mt-4 text-xs text-white/50">Your personal memory system. Remember everything that matters.</p>
          <p className="mt-1.5 text-xs text-primary/70">Chat first — timelines & views help you explore what you&apos;ve shared.</p>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/5 px-2 py-1">
            <Shield className="h-3 w-3 text-green-400" />
            <p className="text-xs text-green-400/80">100% Private & Secure</p>
          </div>
        </div>
        <div className="mt-8 space-y-2">
          {/* 0. Home — dashboard overview */}
          <button
            type="button"
            onClick={() => handleSurfaceChange('home')}
            aria-label="Go to home dashboard"
            aria-current={activeSurface === 'home' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'home'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <BookMarked className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Home</span>
          </button>

          {/* 1. Chat — main feature: accent bar + tagline */}
          <button
            onClick={() => handleSurfaceChange('chat')}
            aria-label="Open chat interface"
            aria-current={activeSurface === 'chat' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border border-l-4 px-3 py-2.5 text-left transition",
              activeSurface === 'chat'
                ? "border-primary border-l-primary bg-primary/15 text-white"
                : "border-transparent border-l-primary bg-primary/5 text-white/90 hover:bg-primary/10"
            )}
          >
            <MessageSquareText className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <span className="block text-sm font-medium">Chat</span>
              <span className="block text-xs text-primary/80 mt-0.5">Your story starts here</span>
            </div>
          </button>

          {/* 2. Focus on… / Story entities */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Focus on…</p>
          <button
            type="button"
            onClick={() => handleSurfaceChange('characters')}
            aria-label="Open characters view"
            aria-current={activeSurface === 'characters' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'characters'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Users className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Characters</span>
            {counts && counts.characters > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.characters}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('locations')}
            aria-label="Open locations view"
            aria-current={activeSurface === 'locations' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'locations'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <MapPin className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Locations</span>
            {counts && counts.locations > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.locations}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('events')}
            aria-label="Open life log"
            aria-current={activeSurface === 'events' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'events'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Calendar className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Life Log</span>
            {counts && counts.events > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.events}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('family')}
            aria-label="Open family view"
            aria-current={activeSurface === 'family' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'family'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <TreePine className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Family</span>
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('organizations')}
            aria-label="Open groups view"
            aria-current={activeSurface === 'organizations' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'organizations'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Building2 className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Groups</span>
            {counts && counts.organizations > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.organizations}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('skills')}
            aria-label="Open skills view"
            aria-current={activeSurface === 'skills' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'skills'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Zap className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Skills</span>
            {counts && counts.skills > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.skills}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSurfaceChange('projects')}
            aria-label="Open projects view"
            aria-current={activeSurface === 'projects' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'projects'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Briefcase className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Projects</span>
            {counts && counts.projects > 0 && (
              <span className="ml-auto text-xs text-white/40 bg-white/8 rounded-full px-1.5 py-0.5 leading-none">{counts.projects}</span>
            )}
          </button>
          <button
            onClick={() => handleSurfaceChange('love')}
            aria-label="Open love and relationships"
            aria-current={activeSurface === 'love' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'love'
                ? 'border-pink-500 bg-pink-500/10 text-white'
                : 'border-transparent text-white/70 hover:border-pink-500 hover:bg-pink-500/10'
            )}
          >
            <Heart className="h-4 w-4 text-pink-400" aria-hidden="true" />
            Love & Relationships
          </button>

          {/* 3. Gossip & claims */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Gossip & claims</p>
          <button
            onClick={() => handleSurfaceChange('perceptions')}
            aria-label="Open gossip and claims"
            aria-current={activeSurface === 'perceptions' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'perceptions'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
            Perceptions
          </button>

          {/* 4. Explore your story */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Explore your story</p>
          <button
            onClick={() => handleSurfaceChange('timeline')}
            aria-label="Open timeline view"
            aria-current={activeSurface === 'timeline' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'timeline'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            Omni Timeline
          </button>
          <button
            onClick={() => handleSurfaceChange('saga')}
            aria-label="Open life saga"
            aria-current={activeSurface === 'saga' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'saga'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Life Saga
          </button>
          <button
            onClick={() => handleSurfaceChange('documents')}
            aria-label="Open documents library"
            aria-current={activeSurface === 'documents' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'documents'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Documents
          </button>
          <button
            onClick={() => handleSurfaceChange('gaps')}
            aria-label="Open knowledge gaps and coverage"
            aria-current={activeSurface === 'gaps' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'gaps'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            Knowledge Gaps
          </button>
          <button
            onClick={() => handleSurfaceChange('discovery')}
            aria-label="Open discovery hub"
            aria-current={activeSurface === 'discovery' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'discovery'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
            Discovery Hub
          </button>
          <button
            onClick={() => handleSurfaceChange('quests')}
            aria-label="Open quests"
            aria-current={activeSurface === 'quests' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'quests'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            Quests
          </button>

          {/* 5. Your content */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Your content</p>
          <button
            onClick={() => handleSurfaceChange('lorebook')}
            aria-label="Open lore book"
            aria-current={activeSurface === 'lorebook' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm font-bold transition",
              activeSurface === 'lorebook'
                ? 'border-primary bg-primary/20 text-white shadow-lg shadow-primary/20'
                : 'border-primary/50 bg-primary/5 text-white hover:border-primary hover:bg-primary/15 hover:shadow-md hover:shadow-primary/10'
            )}
          >
            <BookMarked className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            LoreBooks
          </button>
          <button
            onClick={() => handleSurfaceChange('memoir')}
            aria-label="Open lore editor"
            aria-current={activeSurface === 'memoir' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ml-3",
              activeSurface === 'memoir'
                ? 'border-primary/40 bg-primary/10 text-white'
                : 'border-transparent text-white/50 hover:border-primary/30 hover:text-white/80 hover:bg-primary/5'
            )}
          >
            <BookOpen className="h-3.5 w-3.5 text-primary/70 shrink-0" aria-hidden="true" />
            Edit Lore
          </button>
          <button
            onClick={() => handleSurfaceChange('photos')}
            aria-label="Open photo album"
            aria-current={activeSurface === 'photos' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'photos'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Images className="h-4 w-4 text-primary" aria-hidden="true" />
            Photo Album
          </button>

          {/* 6. Data */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Data</p>
          <button
            onClick={() => handleSurfaceChange('entities')}
            aria-label="Open entity resolution"
            aria-current={activeSurface === 'entities' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'entities'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Hash className="h-4 w-4 text-primary" aria-hidden="true" />
            Entities
          </button>

          {/* 7. Account & help */}
          <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Account & help</p>
          <button
            onClick={() => handleSurfaceChange('subscription')}
            aria-label="Open subscription management"
            aria-current={activeSurface === 'subscription' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'subscription'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Crown className="h-4 w-4 text-primary" aria-hidden="true" />
            Subscription
          </button>
          <button
            onClick={() => handleSurfaceChange('security')}
            aria-label="Open privacy and security settings"
            aria-current={activeSurface === 'security' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'security'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            Privacy & Security
          </button>
          <button
            onClick={() => handleSurfaceChange('guide')}
            aria-label="Open user guide"
            aria-current={activeSurface === 'guide' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              activeSurface === 'guide'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            User Guide
          </button>
        </div>
      
      {/* Development Routes - Admin only */}
      {userIsAdmin && !config.env.isProduction && (
        <div className="mt-8 border-t border-border/30 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Development</p>
          <div className="space-y-2">
            <button
              onClick={() => { navigate('/dev-console'); onMobileDrawerClose?.(); }}
              aria-label="Open dev console"
              aria-current={isActiveRoute('/dev-console') ? 'page' : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                isActiveRoute('/dev-console')
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
              )}
            >
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              Dev Console
            </button>
            {onToggleDevMode && (
              <button
                onClick={onToggleDevMode}
                aria-label={devModeEnabled ? 'Hide dev mode' : 'Show dev mode'}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                  devModeEnabled
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
                )}
              >
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                {devModeEnabled ? 'Hide Dev Mode' : 'Dev Mode'}
              </button>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Sticky bottom — profile when logged in, sign-in prompt when logged out */}
      <div className="sticky bottom-0 pt-3 pb-2 border-t border-border/30 bg-black/20 backdrop-blur-md z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] space-y-2">
        {/* Admin Console */}
        {userIsAdmin && (
          <button
            type="button"
            onClick={() => { navigate('/admin'); onMobileDrawerClose?.(); }}
            aria-label="Open admin console"
            aria-current={isActiveRoute('/admin') ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all relative overflow-hidden group",
              isActiveRoute('/admin')
                ? 'border-primary bg-gradient-to-r from-primary/20 to-purple-600/20 text-white shadow-lg shadow-primary/20'
                : 'border-primary/60 bg-gradient-to-r from-primary/10 to-purple-600/10 text-white hover:border-primary hover:from-primary/20 hover:to-purple-600/20'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -translate-x-full group-hover:translate-x-full" />
            <Settings className="h-4 w-4 text-primary relative z-10" aria-hidden="true" />
            <span className="relative z-10">Admin Console</span>
            <span className="ml-auto relative z-10 text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full border border-primary/50">Admin</span>
          </button>
        )}

        {user ? (
          /* Logged-in: avatar + name + account link */
          <button
            type="button"
            onClick={() => { navigate('/account'); onMobileDrawerClose?.(); }}
            aria-label="Open account center"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-white/5 group"
          >
            <UserAvatarButton user={user} size={36} editable={false} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white font-medium truncate leading-tight">
                {user.user_metadata?.full_name || user.user_metadata?.name || 'My Account'}
              </p>
              <p className="text-white/40 text-xs truncate leading-tight">{user.email}</p>
            </div>
            <UserCog className="h-4 w-4 text-white/30 group-hover:text-white/60 flex-shrink-0 transition-colors" aria-hidden="true" />
          </button>
        ) : (
          /* Logged-out: sign-in prompt */
          <button
            type="button"
            onClick={() => { navigate('/login'); onMobileDrawerClose?.(); }}
            aria-label="Sign in"
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-white/60 hover:border-primary/40 hover:text-white hover:bg-primary/5 transition"
          >
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              <UserCog className="h-4 w-4 text-white/30" aria-hidden="true" />
            </div>
            <span className="flex-1 text-left">Sign in</span>
            <Shield className="h-3.5 w-3.5 text-white/20" aria-hidden="true" />
          </button>
        )}

        {/* Back to landing page */}
        <button
          type="button"
          onClick={() => { navigate('/home'); onMobileDrawerClose?.(); }}
          aria-label="Back to homepage"
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-white/60 transition-colors group"
        >
          <ExternalLink className="h-3 w-3 shrink-0 group-hover:text-primary/60 transition-colors" aria-hidden="true" />
          <span>Back to homepage</span>
        </button>
      </div>
    </div>
  );
};

export const Sidebar = ({
  activeSurface,
  onSurfaceChange,
  onToggleDevMode,
  devModeEnabled,
  isMobileDrawerOpen = false,
  onMobileDrawerClose
}: SidebarProps) => {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileDrawerOpen]);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border/60 bg-black/20 p-6 text-white lg:flex h-screen sticky top-0 overflow-hidden">
        <SidebarContent
          activeSurface={activeSurface}
          onSurfaceChange={onSurfaceChange}
          onToggleDevMode={onToggleDevMode}
          devModeEnabled={devModeEnabled}
        />
      </aside>

      {/* Mobile Drawer */}
      {isMobileDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileDrawerClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-border/60 bg-black/95 backdrop-blur-lg transform transition-transform duration-300 ease-in-out lg:hidden overflow-y-auto",
          isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0)', paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        aria-label="Navigation menu"
        aria-hidden={!isMobileDrawerOpen}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/60 lg:hidden">
          <Logo size="md" showText={true} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileDrawerClose}
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4 lg:hidden">
          <SidebarContent
            activeSurface={activeSurface}
            onSurfaceChange={onSurfaceChange}
            onToggleDevMode={onToggleDevMode}
            devModeEnabled={devModeEnabled}
            onMobileDrawerClose={onMobileDrawerClose}
          />
        </div>
      </aside>
    </>
  );
};
