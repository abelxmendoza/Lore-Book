import { describe, it, expect } from 'vitest';
import {
  getSurfaceFromRoute,
  getRouteFromSurface,
  routeToSurface,
  surfaceToRoute,
  isAppShellRoute,
} from './routeMapping';

describe('routeMapping', () => {
  describe('getSurfaceFromRoute', () => {
    it('maps /home to home dashboard', () => {
      expect(getSurfaceFromRoute('/home')).toBe('home');
    });

    it('does not treat public landing / as home', () => {
      expect(routeToSurface['/']).toBeUndefined();
      expect(getSurfaceFromRoute('/')).toBe('chat');
    });

    it('returns exact match for /chat', () => {
      expect(getSurfaceFromRoute('/chat')).toBe('chat');
    });

    it('maps /chat/:threadId to chat', () => {
      expect(getSurfaceFromRoute('/chat/thread-abc-123')).toBe('chat');
    });

    it('returns correct surface for /characters', () => {
      expect(getSurfaceFromRoute('/characters')).toBe('characters');
    });

    it('strips query and hash', () => {
      expect(getSurfaceFromRoute('/timeline?foo=1')).toBe('timeline');
      expect(getSurfaceFromRoute('/timeline?view=search#section')).toBe('timeline');
    });

    it('maps /memories to events (Life Log)', () => {
      expect(getSurfaceFromRoute('/memories')).toBe('events');
    });

    it('returns correct surface for /family', () => {
      expect(getSurfaceFromRoute('/family')).toBe('family');
      expect(getRouteFromSurface('family')).toBe('/family');
    });

    it('maps /lorebook/library to lorebook surface', () => {
      expect(getSurfaceFromRoute('/lorebook/library')).toBe('lorebook');
      expect(isAppShellRoute('/lorebook/library')).toBe(true);
    });

    it('maps legacy /lorebookLibrary to lorebook surface', () => {
      expect(getSurfaceFromRoute('/lorebookLibrary')).toBe('lorebook');
      expect(isAppShellRoute('/lorebookLibrary')).toBe(true);
    });

    it('defaults to chat for unknown path', () => {
      expect(getSurfaceFromRoute('/unknown')).toBe('chat');
    });

    it('matches nested route for /characters/123', () => {
      expect(getSurfaceFromRoute('/characters/123')).toBe('characters');
    });

    it('matches discovery sub-routes', () => {
      expect(getSurfaceFromRoute('/discovery/soul-profile')).toBe('discovery');
    });
  });

  describe('getRouteFromSurface', () => {
    it('returns /home for home surface', () => {
      expect(getRouteFromSurface('home')).toBe('/home');
    });

    it('returns /chat for chat surface', () => {
      expect(getRouteFromSurface('chat')).toBe('/chat');
    });

    it('returns /characters for characters surface', () => {
      expect(getRouteFromSurface('characters')).toBe('/characters');
    });

    it('returns /privacy for privacy-settings surface', () => {
      expect(getRouteFromSurface('privacy-settings')).toBe('/privacy');
    });
  });

  describe('routeToSurface and surfaceToRoute', () => {
    it('routeToSurface maps /home to home', () => {
      expect(routeToSurface['/home']).toBe('home');
    });

    it('surfaceToRoute maps home to /home', () => {
      expect(surfaceToRoute.home).toBe('/home');
    });

    it('surfaceToRoute has chat mapping to /chat', () => {
      expect(surfaceToRoute.chat).toBe('/chat');
    });

    it('round-trip for main app routes', () => {
      const routes = ['/home', '/chat', '/timeline', '/characters', '/love', '/quests'];
      for (const r of routes) {
        expect(getRouteFromSurface(getSurfaceFromRoute(r))).toBe(r);
      }
    });
  });

  describe('isAppShellRoute', () => {
    it('returns false for public landing', () => {
      expect(isAppShellRoute('/')).toBe(false);
      expect(isAppShellRoute('/features')).toBe(false);
    });

    it('returns true for app routes', () => {
      expect(isAppShellRoute('/home')).toBe(true);
      expect(isAppShellRoute('/chat')).toBe(true);
      expect(isAppShellRoute('/chat/abc')).toBe(true);
    });
  });
});
