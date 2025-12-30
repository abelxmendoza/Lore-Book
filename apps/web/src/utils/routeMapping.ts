/**
 * Route to Surface Mapping
 * 
 * Centralized mapping between routes and surfaces for consistent navigation
 */

export type SurfaceKey = 
  | 'chat'
  | 'timeline'
  | 'search'
  | 'characters'
  | 'locations'
  | 'memoir'
  | 'lorebook'
  | 'photos'
  | 'perceptions'
  | 'discovery'
  | 'continuity'
  | 'subscription'
  | 'pricing'
  | 'security'
  | 'privacy-settings'
  | 'guide';

/**
 * Map from route path to surface key
 */
export const routeToSurface: Record<string, SurfaceKey> = {
  '/': 'chat',
  '/chat': 'chat',
  '/timeline': 'timeline',
  '/search': 'search',
  '/characters': 'characters',
  '/locations': 'locations',
  '/memoir': 'memoir',
  '/lorebook': 'lorebook',
  '/photos': 'photos',
  '/perceptions': 'perceptions',
  '/discovery': 'discovery',
  '/continuity': 'continuity',
  '/subscription': 'subscription',
  '/pricing': 'pricing',
  '/security': 'security',
  '/privacy': 'privacy-settings',
  '/guide': 'guide',
};

/**
 * Map from surface key to route path
 */
export const surfaceToRoute: Record<SurfaceKey, string> = {
  'chat': '/chat',
  'timeline': '/timeline',
  'search': '/search',
  'characters': '/characters',
  'locations': '/locations',
  'memoir': '/memoir',
  'lorebook': '/lorebook',
  'photos': '/photos',
  'perceptions': '/perceptions',
  'discovery': '/discovery',
  'continuity': '/continuity',
  'subscription': '/subscription',
  'pricing': '/pricing',
  'security': '/security',
  'privacy-settings': '/privacy',
  'guide': '/guide',
};

/**
 * Get surface key from route path
 */
export function getSurfaceFromRoute(pathname: string): SurfaceKey {
  // Remove query params and hash
  const path = pathname.split('?')[0].split('#')[0];
  
  // Check exact match first
  if (routeToSurface[path]) {
    return routeToSurface[path];
  }
  
  // Check if path starts with any route (for nested routes)
  for (const [route, surface] of Object.entries(routeToSurface)) {
    if (path.startsWith(route) && route !== '/') {
      return surface;
    }
  }
  
  // Default to chat
  return 'chat';
}

/**
 * Get route path from surface key
 */
export function getRouteFromSurface(surface: SurfaceKey): string {
  return surfaceToRoute[surface] || '/chat';
}

