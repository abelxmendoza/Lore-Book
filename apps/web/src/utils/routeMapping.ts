/**
 * Route to Surface Mapping
 * 
 * Centralized mapping between routes and surfaces for consistent navigation
 */

export type SurfaceKey =
  | 'home'
  | 'chat'
  | 'timeline'
  | 'search'
  | 'characters'
  | 'locations'
  | 'memoir'
  | 'lorebook'
  | 'photos'
  | 'perceptions'
  | 'events'
  | 'entities'
  | 'organizations'
  | 'skills'
  | 'discovery'
  | 'continuity'
  | 'subscription'
  | 'pricing'
  | 'security'
  | 'privacy-settings'
  | 'privacy-policy'
  | 'guide'
  | 'love'
  | 'quests'
  | 'gaps'
  | 'saga'
  | 'intelligence';

/**
 * Map from route path to surface key
 */
export const routeToSurface: Record<string, SurfaceKey> = {
  '/': 'home',
  '/chat': 'chat',
  '/timeline': 'timeline',
  '/search': 'search',
  '/characters': 'characters',
  '/locations': 'locations',
  '/memoir': 'memoir',
  '/lorebook': 'lorebook',
  '/photos': 'photos',
  '/memories': 'events', // Legacy memory URL now lands in the consolidated Life Log
  '/perceptions': 'perceptions',
  '/events': 'events',
  '/entities': 'entities',
  '/organizations': 'organizations',
  '/skills': 'skills',
  '/discovery': 'discovery',
  '/continuity': 'continuity',
  '/subscription': 'subscription',
  '/pricing': 'pricing',
  '/security': 'security',
  '/privacy': 'privacy-settings',
  '/guide': 'guide',
  '/love': 'love',
  '/quests': 'quests',
  '/gaps': 'gaps',
  '/saga': 'saga',
  '/intelligence': 'intelligence',
};

/**
 * Map from surface key to route path
 */
export const surfaceToRoute: Record<SurfaceKey, string> = {
  'home': '/',
  'chat': '/chat',
  'timeline': '/timeline',
  'search': '/search',
  'characters': '/characters',
  'locations': '/locations',
  'memoir': '/memoir',
  'lorebook': '/lorebook',
  'photos': '/photos',
  'perceptions': '/perceptions',
  'events': '/events',
  'entities': '/entities',
  'organizations': '/organizations',
  'skills': '/skills',
  'discovery': '/discovery',
  'continuity': '/continuity',
  'subscription': '/subscription',
  'pricing': '/pricing',
  'security': '/security',
  'privacy-settings': '/privacy',
  'privacy-policy': '/privacy-policy',
  'guide': '/guide',
  'love': '/love',
  'quests': '/quests',
  'gaps': '/gaps',
  'saga': '/saga',
  'intelligence': '/intelligence',
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
