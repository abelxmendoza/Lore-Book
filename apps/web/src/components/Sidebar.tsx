import { BookMarked, CalendarDays, MessageSquareText, Plus, Search, Sparkles, Users, BookOpen, MapPin, Crown, Shield, Compass, TrendingUp, Settings, UserCog } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { Logo } from './Logo';
import { Button } from './ui/button';
import { config } from '../config/env';
import { useAuth } from '../lib/supabase';
import { isAdmin } from '../middleware/roleGuard';

interface SidebarProps {
  activeSurface?: 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity';
  onSurfaceChange?: (surface: 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity') => void;
  onCreateChapter?: () => void;
  onToggleDevMode?: () => void;
  devModeEnabled?: boolean;
}

import { getRouteFromSurface, surfaceToRoute } from '../utils/routeMapping';

export const Sidebar = ({
  activeSurface,
  onSurfaceChange,
  onCreateChapter,
  onToggleDevMode,
  devModeEnabled
}: SidebarProps) => {
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
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userIsAdmin = user ? isAdmin(user) : false;

  return (
  <aside className="hidden w-64 flex-col border-r border-border/60 bg-black/20 p-6 text-white lg:flex">
    <div className="mb-6">
      <Logo size="lg" showText={true} />
      <p className="mt-4 text-xs text-white/50">Cyberpunk journal with GPT-4 memory.</p>
    </div>
    <div className="mt-8 space-y-2">
      <button
        onClick={() => handleSurfaceChange('chat')}
        aria-label="Open chat interface"
        aria-current={activeSurface === 'chat' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'chat'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
        Chat
      </button>
      <button
        onClick={() => handleSurfaceChange('characters')}
        aria-label="Open characters view"
        aria-current={activeSurface === 'characters' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'characters'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Users className="h-4 w-4 text-primary" aria-hidden="true" />
        Characters
      </button>
      <button
        onClick={() => onSurfaceChange?.('locations')}
        aria-label="Open locations view"
        aria-current={activeSurface === 'locations' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'locations'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
        Locations
      </button>
      <button
        onClick={() => handleSurfaceChange('timeline')}
        aria-label="Open timeline view"
        aria-current={activeSurface === 'timeline' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'timeline'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
        Omni Timeline
      </button>
      <button
        onClick={() => handleSurfaceChange('search')}
        aria-label="Open memory explorer"
        aria-current={activeSurface === 'search' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'search'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Search className="h-4 w-4 text-primary" aria-hidden="true" />
        Memory Explorer
      </button>
      <button
        onClick={() => handleSurfaceChange('memoir')}
        aria-label="Open biography editor"
        aria-current={activeSurface === 'memoir' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'memoir'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        My Biography Editor
      </button>
      <button
        onClick={() => handleSurfaceChange('lorebook')}
        aria-label="Open lore book"
        aria-current={activeSurface === 'lorebook' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm font-bold transition ${
          activeSurface === 'lorebook'
            ? 'border-primary bg-primary/20 text-white shadow-lg shadow-primary/20'
            : 'border-primary/50 bg-primary/5 text-white hover:border-primary hover:bg-primary/15 hover:shadow-md hover:shadow-primary/10'
        }`}
      >
        <BookMarked className="h-5 w-5 text-primary" aria-hidden="true" />
        Lore Book
      </button>
      <button
        onClick={() => handleSurfaceChange('discovery')}
        aria-label="Open discovery hub"
        aria-current={activeSurface === 'discovery' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'discovery'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
        Discovery Hub
      </button>
      <button
        onClick={() => handleSurfaceChange('subscription')}
        aria-label="Open subscription management"
        aria-current={activeSurface === 'subscription' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'subscription'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Crown className="h-4 w-4 text-primary" aria-hidden="true" />
        Subscription
      </button>
      <button
        onClick={() => handleSurfaceChange('security')}
        aria-label="Open privacy and security settings"
        aria-current={activeSurface === 'security' ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          activeSurface === 'security'
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
        Privacy & Security
      </button>
      <button
        onClick={() => navigate('/account')}
        aria-label="Open account center"
        aria-current={isActiveRoute('/account') ? 'page' : undefined}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
          isActiveRoute('/account')
            ? 'border-primary bg-primary/10 text-white'
            : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
        }`}
      >
        <UserCog className="h-4 w-4 text-primary" aria-hidden="true" />
        Account Center
      </button>
      {/* Admin Console - Visible to admins in production, all users in development */}
      {(userIsAdmin || !config.env.isProduction) && (
        <button
          onClick={() => navigate('/admin')}
          aria-label="Open admin console"
          aria-current={isActiveRoute('/admin') ? 'page' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
            isActiveRoute('/admin')
              ? 'border-primary bg-primary/10 text-white'
              : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
          }`}
        >
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" />
          Admin Console
        </button>
      )}
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
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                isActiveRoute('/dev-console')
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
              }`}
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
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                devModeEnabled
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-transparent text-white/70 hover:border-primary hover:bg-primary/10'
              }`}
            >
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              {devModeEnabled ? 'Hide Dev Mode' : 'Dev Mode'}
            </button>
          )}
        </div>
      </div>
    )}
    
    <div className="mt-auto">
      <div className="space-y-2">
        <Button className="w-full" leftIcon={<Plus className="h-4 w-4" />} onClick={onCreateChapter}>
          New Chapter
        </Button>
      </div>
    </div>
  </aside>
  );
};
