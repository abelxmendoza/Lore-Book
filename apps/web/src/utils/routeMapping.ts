/**
 * Route to Surface Mapping
 *
 * Centralized mapping between in-app routes and surfaces.
 * Public marketing routes (/, /features, …) are NOT listed here — only App shell routes.
 */

export type SurfaceKey =
  | 'home'
  | 'chat'
  | 'timeline'
  | 'characters'
  | 'locations'
  | 'memoir'
  | 'lorebook'
  | 'photos'
  | 'perceptions'
  | 'events'
  | 'entities'
  | 'organizations'
  | 'family'
  | 'skills'
  | 'projects'
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
  | 'documents'
  | 'intelligence'
  | 'anchors';

/**
 * Map from in-app route path to surface key.
 * `/` is the public landing page — dashboard lives at `/home`.
 */
export const routeToSurface: Record<string, SurfaceKey> = {
  '/home': 'home',
  '/chat': 'chat',
  '/timeline': 'timeline',
  '/characters': 'characters',
  '/locations': 'locations',
  '/memoir': 'memoir',
  '/lorebook': 'lorebook',
  '/lorebook/library': 'lorebook',
  '/lorebookLibrary': 'lorebook',
  '/photos': 'photos',
  '/memories': 'events',
  '/perceptions': 'perceptions',
  '/events': 'events',
  '/entities': 'entities',
  '/organizations': 'organizations',
  '/family': 'family',
  '/skills': 'skills',
  '/projects': 'projects',
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
  '/documents': 'documents',
  '/intelligence': 'intelligence',
  '/narrative-anchors': 'anchors',
};

/**
 * Map from surface key to in-app route path.
 */
export const surfaceToRoute: Record<SurfaceKey, string> = {
  home: '/home',
  chat: '/chat',
  timeline: '/timeline',
  characters: '/characters',
  locations: '/locations',
  memoir: '/memoir',
  lorebook: '/lorebook',
  photos: '/photos',
  perceptions: '/perceptions',
  events: '/events',
  entities: '/entities',
  organizations: '/organizations',
  family: '/family',
  skills: '/skills',
  projects: '/projects',
  discovery: '/discovery',
  continuity: '/continuity',
  subscription: '/subscription',
  pricing: '/pricing',
  security: '/security',
  'privacy-settings': '/privacy',
  'privacy-policy': '/privacy-policy',
  guide: '/guide',
  love: '/love',
  quests: '/quests',
  gaps: '/gaps',
  saga: '/saga',
  documents: '/documents',
  intelligence: '/intelligence',
  anchors: '/narrative-anchors',
};

/** Longest-prefix match first so `/discovery/foo` beats `/disc` if ever added. */
const ROUTE_PREFIXES = Object.entries(routeToSurface).sort(
  ([a], [b]) => b.length - a.length
);

/**
 * Get surface key from route path (App shell only).
 */
export function getSurfaceFromRoute(pathname: string): SurfaceKey {
  const path = pathname.split('?')[0].split('#')[0];

  if (routeToSurface[path]) {
    return routeToSurface[path];
  }

  for (const [route, surface] of ROUTE_PREFIXES) {
    if (path === route || path.startsWith(`${route}/`)) {
      return surface;
    }
  }

  return 'chat';
}

/**
 * Get route path from surface key.
 */
export function getRouteFromSurface(surface: SurfaceKey): string {
  return surfaceToRoute[surface] ?? '/chat';
}

/** True when pathname is an App shell route (not public marketing). */
export function isAppShellRoute(pathname: string): boolean {
  const path = pathname.split('?')[0].split('#')[0];
  if (routeToSurface[path]) return true;
  return ROUTE_PREFIXES.some(([route]) => path === route || path.startsWith(`${route}/`));
}
