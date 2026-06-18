import { getAppStore } from './appStoreRef';
import { entitiesApi } from './api/entitiesApi';
import { loreApi } from './api/loreApi';
import { questsApi } from './api/questsApi';
import { pulseCharacterHighlights } from './slices/chatSlice';

export type EntityCacheTag =
  | 'Character'
  | 'Location'
  | 'Organization'
  | 'Quest'
  | 'Project'
  | 'Skill'
  | 'Event';

export type LoreCacheTag = 'Entry' | 'Timeline' | 'Chapter';

export function invalidateEntityTags(tags: EntityCacheTag[]): void {
  getAppStore().dispatch(entitiesApi.util.invalidateTags(tags));
}

export function invalidateLoreTags(tags: LoreCacheTag[]): void {
  getAppStore().dispatch(loreApi.util.invalidateTags(tags));
}

export function invalidateQuestTags(): void {
  getAppStore().dispatch(questsApi.util.invalidateTags(['Quest']));
}

/** After chat ingestion or CRUD — refresh RTK caches and optionally pulse character highlights. */
export function invalidateAfterChatIngestion(options?: {
  characterIds?: string[];
  locationIds?: string[];
}): void {
  const tags = new Set<EntityCacheTag>(['Character']);
  if (options?.locationIds?.length) tags.add('Location');
  invalidateEntityTags([...tags]);
  invalidateLoreTags(['Entry', 'Timeline', 'Chapter']);

  if (options?.characterIds?.length) {
    getAppStore().dispatch(pulseCharacterHighlights(options.characterIds));
  }
}
