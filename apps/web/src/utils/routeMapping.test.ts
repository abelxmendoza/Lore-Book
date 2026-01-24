import { describe, it, expect } from 'vitest';
import { getSurfaceFromRoute, getRouteFromSurface, routeToSurface, surfaceToRoute } from './routeMapping';

describe('routeMapping', () => {
  describe('getSurfaceFromRoute', () => {
    it('returns exact match for /', () => {
      expect(getSurfaceFromRoute('/')).toBe('chat');
    });

    it('returns exact match for /chat', () => {
      expect(getSurfaceFromRoute('/chat')).toBe('chat');
    });

    it('returns correct surface for /characters', () => {
      expect(getSurfaceFromRoute('/characters')).toBe('characters');
    });

    it('strips query and hash', () => {
      expect(getSurfaceFromRoute('/timeline?foo=1')).toBe('timeline');
      expect(getSurfaceFromRoute('/search#section')).toBe('search');
    });

    it('maps /memories to search', () => {
      expect(getSurfaceFromRoute('/memories')).toBe('search');
    });

    it('defaults to chat for unknown path', () => {
      expect(getSurfaceFromRoute('/unknown')).toBe('chat');
    });

    it('matches nested route for /characters/123', () => {
      expect(getSurfaceFromRoute('/characters/123')).toBe('characters');
    });
  });

  describe('getRouteFromSurface', () => {
    it('returns /chat for chat surface', () => {
      expect(getRouteFromSurface('chat')).toBe('/chat');
    });

    it('returns /characters for characters surface', () => {
      expect(getRouteFromSurface('characters')).toBe('/characters');
    });

    it('returns /privacy for privacy-settings surface', () => {
      expect(getRouteFromSurface('privacy-settings')).toBe('/privacy');
    });

    it('defaults to /chat for unknown surface', () => {
      expect(getRouteFromSurface('chat' as any)).toBe('/chat');
    });
  });

  describe('routeToSurface and surfaceToRoute', () => {
    it('routeToSurface has / mapping to chat', () => {
      expect(routeToSurface['/']).toBe('chat');
    });

    it('surfaceToRoute has chat mapping to /chat', () => {
      expect(surfaceToRoute['chat']).toBe('/chat');
    });

    it('round-trip: getRouteFromSurface(getSurfaceFromRoute(x)) for main routes', () => {
      const routes = ['/chat', '/timeline', '/characters', '/love', '/quests'];
      for (const r of routes) {
        const surface = getSurfaceFromRoute(r);
        const back = getRouteFromSurface(surface);
        expect(back).toBe(r === '/' ? '/chat' : r);
      }
    });
  });
});
