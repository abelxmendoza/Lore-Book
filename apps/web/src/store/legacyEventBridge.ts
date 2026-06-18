import { baseApi } from './api/baseApi';

import type { AppDispatch } from './index';

type TagType = Parameters<typeof baseApi.util.invalidateTags>[0][number];

/**
 * Maps the legacy `lk:*-updated` window events to RTK Query cache tags.
 *
 * During the migration, existing code still dispatches these window events on
 * mutation. This bridge translates them into tag invalidations so any component
 * that has moved to RTK Query stays fresh without the old event bus. Once all
 * consumers use RTK Query mutations (which invalidate tags directly), the
 * dispatchers and this bridge can be deleted.
 */
const EVENT_TAG_MAP: Record<string, TagType[]> = {
  'lk:characters-updated': ['Character'],
  'lk:locations-updated': ['Location'],
  'lk:organizations-updated': ['Organization'],
  'lk:quests-updated': ['Quest'],
  'lk:projects-updated': ['Project'],
  'lk:skills-updated': ['Skill'],
  'lk:events-updated': ['Event'],
  'lk:romantic-relationships-updated': ['Character'],
  'lk:story-data-updated': [
    'Story',
    'Character',
    'Location',
    'Organization',
    'Quest',
    'Project',
    'Skill',
    'Event',
    'Entry',
    'Timeline',
    'Chapter',
  ],
  'lk:inference-complete': [
    'Character',
    'Location',
    'Organization',
    'Quest',
    'Project',
    'Skill',
    'Event',
    'Entry',
    'Timeline',
  ],
  'lk:guest-lore-updated': ['Entry', 'Timeline', 'Character'],
};

let isBound = false;

export function bindLegacyEntityEvents(dispatch: AppDispatch): () => void {
  if (typeof window === 'undefined') return () => {};
  // Guard against double-binding (e.g. React StrictMode double-invoke or
  // multiple providers) so a single event only triggers one invalidation.
  if (isBound) return () => {};
  isBound = true;

  const bound: Array<[string, EventListener]> = [];
  for (const [eventName, tags] of Object.entries(EVENT_TAG_MAP)) {
    const handler: EventListener = () => {
      try {
        dispatch(baseApi.util.invalidateTags(tags));
      } catch (error) {
        // A failed cache invalidation must never crash the app or break the
        // legacy dispatcher; log and continue.
        if (typeof console !== 'undefined') {
          console.error(`[legacyEventBridge] failed to invalidate tags for ${eventName}`, error);
        }
      }
    };
    window.addEventListener(eventName, handler);
    bound.push([eventName, handler]);
  }

  return () => {
    bound.forEach(([eventName, handler]) => window.removeEventListener(eventName, handler));
    isBound = false;
  };
}
