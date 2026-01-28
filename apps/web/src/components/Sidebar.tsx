import { useState, useEffect } from 'react';
import { BookMarked, CalendarDays, MessageSquareText, Plus, Search, Sparkles, Users, BookOpen, MapPin, Crown, Shield, Compass, TrendingUp, Settings, UserCog, HelpCircle, Images, Eye, Calendar, Hash, Building2, Zap, X, Heart, Target } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { Logo } from './Logo';
import { Button } from './ui/button';
import { config } from '../config/env';
import { useAuth } from '../lib/supabase';
import { isAdmin } from '../middleware/roleGuard';
import { cn } from '../lib/cn';

import { getRouteFromSurface, surfaceToRoute } from '../utils/routeMapping';

interface SidebarProps {
  activeSurface?: 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity' | 'guide' | 'photos' | 'perceptions' | 'events' | 'entities' | 'organizations' | 'skills' | 'love' | 'quests';
  onSurfaceChange?: (surface: 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity' | 'guide' | 'photos' | 'perceptions' | 'events' | 'entities' | 'organizations' | 'skills' | 'love' | 'quests') => void;
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

  const handleSurfaceChange = (surface: string) => {
    // Navigate to route
    const route = surfaceToRoute[surface];
    if (route) {
      navigate(route);
    }
    // Also call the callback for backward compatibility
    onSurfaceChange?.(surface as any);
    // Close mobile drawer when navigating
    onMobileDrawerClose?.();
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userIsAdmin = user ? isAdmin(user) : false;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="mb-6 hidden lg:block">
          <Logo size="lg" showText={true} />
          <p className="mt-4 text-xs text-white/50">Your personal memory system. Remember everything that matters.</p>
          <p className="mt-1.5 text-xs text-primary/70">Chat first — timelines & views help you explore what you&apos;ve shared.</p>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/5 px-2 py-1">
            <Shield className="h-3 w-3 text-green-400" />
            <p className="text-xs text-green-400/80">100% Private & Secure</p>
          </div>
        </div>
        <div className="mt-8 space-y-2">
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
              <span className="block text-[10px] text-primary/80 mt-0.5">Your story starts here</span>
            </div>
          </button>

          {/* 2. Focus on… / Story entities */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Focus on…</p>
          <button
            onClick={() => handleSurfaceChange('characters')}
            aria-label="Open characters view"
            aria-current={activeSurface === 'characters' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'characters'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            Characters
          </button>
          <button
            onClick={() => handleSurfaceChange('locations')}
            aria-label="Open locations view"
            aria-current={activeSurface === 'locations' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'locations'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            Locations
          </button>
          <button
            onClick={() => handleSurfaceChange('events')}
            aria-label="Open events view"
            aria-current={activeSurface === 'events' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'events'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
            Events
          </button>
          <button
            onClick={() => handleSurfaceChange('organizations')}
            aria-label="Open groups view"
            aria-current={activeSurface === 'organizations' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'organizations'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Groups
          </button>
          <button
            onClick={() => handleSurfaceChange('skills')}
            aria-label="Open skills view"
            aria-current={activeSurface === 'skills' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'skills'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
            Skills
          </button>
          <button
            onClick={() => handleSurfaceChange('love')}
            aria-label="Open love and relationships"
            aria-current={activeSurface === 'love' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'love'
                ? 'border-pink-500 bg-pink-500/10 text-white'
                : 'border-transparent text-white/70 hover:border-pink-500 hover:bg-pink-500/10'
            )}
          >
            <Heart className="h-4 w-4 text-pink-400" aria-hidden="true" />
            Love & Relationships
          </button>

          {/* 3. Gossip & claims */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Gossip & claims</p>
          <button
            onClick={() => handleSurfaceChange('perceptions')}
            aria-label="Open gossip and claims"
            aria-current={activeSurface === 'perceptions' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'perceptions'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Eye className="h-4 w-4 text-primary" aria-hidden="true" />
            Perceptions
          </button>

          {/* 4. Explore your story */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Explore your story</p>
          <button
            onClick={() => handleSurfaceChange('timeline')}
            aria-label="Open timeline view"
            aria-current={activeSurface === 'timeline' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'timeline'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            Omni Timeline
          </button>
          <button
            onClick={() => handleSurfaceChange('discovery')}
            aria-label="Open discovery hub"
            aria-current={activeSurface === 'discovery' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'discovery'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
            Discovery Hub
          </button>
          <button
            onClick={() => handleSurfaceChange('search')}
            aria-label="Open memory explorer"
            aria-current={activeSurface === 'search' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'search'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Search className="h-4 w-4 text-primary" aria-hidden="true" />
            Memory Explorer
          </button>
          <button
            onClick={() => handleSurfaceChange('quests')}
            aria-label="Open quests"
            aria-current={activeSurface === 'quests' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'quests'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            Quests
          </button>

          {/* 5. Your content */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Your content</p>
          <button
            onClick={() => handleSurfaceChange('memoir')}
            aria-label="Open biography editor"
            aria-current={activeSurface === 'memoir' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'memoir'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            My Biography Editor
          </button>
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
            <BookMarked className="h-5 w-5 text-primary" aria-hidden="true" />
            Lore Book
          </button>
          <button
            onClick={() => handleSurfaceChange('photos')}
            aria-label="Open photo album"
            aria-current={activeSurface === 'photos' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'photos'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Images className="h-4 w-4 text-primary" aria-hidden="true" />
            Photo Album
          </button>

          {/* 6. Data */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Data</p>
          <button
            onClick={() => handleSurfaceChange('entities')}
            aria-label="Open entity resolution"
            aria-current={activeSurface === 'entities' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'entities'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <Hash className="h-4 w-4 text-primary" aria-hidden="true" />
            Entities
          </button>

          {/* 7. Account & help */}
          <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40 px-1">Account & help</p>
          <button
            onClick={() => handleSurfaceChange('subscription')}
            aria-label="Open subscription management"
            aria-current={activeSurface === 'subscription' ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
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
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
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
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
              activeSurface === 'guide'
                ? 'border-primary bg-primary/10 text-white'
                : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
            )}
          >
            <HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            User Guide
          </button>
        </div>
      
      {/* Development Routes - Only visible in development */}
      {!config.env.isProduction && (
        <div className="mt-8 border-t border-border/30 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Development</p>
          <div className="space-y-2">
            {!import.meta.env.PROD && (
              <button
                onClick={() => navigate('/dev-console')}
                aria-label="Open dev console"
                aria-current={isActiveRoute('/dev-console') ? 'page' : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
                  isActiveRoute('/dev-console')
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
                )}
              >
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Dev Console
              </button>
            )}
            {/* Dev Mode toggle - moved into Development section */}
            {onToggleDevMode && (
              <button
                onClick={onToggleDevMode}
                aria-label={devModeEnabled ? 'Hide dev mode' : 'Show dev mode'}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
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

      {/* Sticky Account Center & Admin Console - Always at bottom */}
      <div className="sticky bottom-0 pt-4 pb-2 border-t border-border/30 bg-black/20 lg:bg-black/20 backdrop-blur-md z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] space-y-2">
        {/* Admin Console - Only visible to admins */}
        {(userIsAdmin || !config.env.isProduction) && (
          <button
            onClick={() => {
              navigate('/admin');
              onMobileDrawerClose?.();
            }}
            aria-label="Open admin console"
            aria-current={isActiveRoute('/admin') ? 'page' : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-all relative overflow-hidden group",
              isActiveRoute('/admin')
                ? 'border-primary bg-gradient-to-r from-primary/20 to-purple-600/20 text-white shadow-lg shadow-primary/20'
                : 'border-primary/60 bg-gradient-to-r from-primary/10 to-purple-600/10 text-white hover:border-primary hover:from-primary/20 hover:to-purple-600/20 hover:shadow-md hover:shadow-primary/10'
            )}
          >
            {/* Animated background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -translate-x-full group-hover:translate-x-full" />
            <Settings className="h-5 w-5 text-primary relative z-10" aria-hidden="true" />
            <span className="relative z-10">Admin Console</span>
            {/* Badge indicator */}
            <span className="ml-auto relative z-10 text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full border border-primary/50">
              Admin
            </span>
          </button>
        )}
        
        {/* Account Center - Always visible */}
        <button
          onClick={() => {
            navigate('/account');
            onMobileDrawerClose?.();
          }}
          aria-label="Open account center"
          aria-current={isActiveRoute('/account') ? 'page' : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-all relative overflow-hidden group",
            isActiveRoute('/account')
              ? 'border-primary bg-gradient-to-r from-primary/20 to-purple-600/20 text-white shadow-lg shadow-primary/20'
              : 'border-primary/60 bg-gradient-to-r from-primary/10 to-purple-600/10 text-white hover:border-primary hover:from-primary/20 hover:to-purple-600/20 hover:shadow-md hover:shadow-primary/10'
          )}
        >
          {/* Animated background glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -translate-x-full group-hover:translate-x-full" />
          <UserCog className="h-5 w-5 text-primary relative z-10" aria-hidden="true" />
          <span className="relative z-10">Account Center</span>
          {/* Badge indicator */}
          <span className="ml-auto relative z-10 text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full border border-primary/50">
            Profile & Settings
          </span>
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
