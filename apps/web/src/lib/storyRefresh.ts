/** Fired after chat ingestion finishes so family trees, timelines, and groups can refresh. */
export const STORY_DATA_UPDATED = 'lk:story-data-updated';

export type StoryRefreshScope = 'family' | 'timeline' | 'organizations' | 'characters' | 'skills' | 'quests' | 'story' | 'all';

export type StoryDataUpdatedDetail = {
  scopes?: StoryRefreshScope[];
  characterIds?: string[];
  organizationIds?: string[];
  /** ms to wait before refreshing (pipeline may still be writing). */
  delayMs?: number;
};

export function dispatchStoryDataUpdated(detail: StoryDataUpdatedDetail = { scopes: ['all'] }) {
  const fire = () => {
    window.dispatchEvent(new CustomEvent<StoryDataUpdatedDetail>(STORY_DATA_UPDATED, { detail }));
    if (detail.scopes?.includes('all') || detail.scopes?.includes('organizations')) {
      window.dispatchEvent(new CustomEvent('lk:organizations-updated'));
    }
    if (detail.scopes?.includes('all') || detail.scopes?.includes('skills')) {
      window.dispatchEvent(new Event('lk:skills-updated'));
    }
    if (detail.scopes?.includes('all') || detail.scopes?.includes('quests')) {
      window.dispatchEvent(new Event('lk:quests-updated'));
    }
  };
  const delay = detail.delayMs ?? 0;
  if (delay > 0) setTimeout(fire, delay);
  else fire();
}

/** Schedule the standard post-chat refresh cadence (fast + slow pipeline completion). */
export function schedulePostChatRefresh(detail: Omit<StoryDataUpdatedDetail, 'delayMs'> = { scopes: ['all'] }) {
  dispatchStoryDataUpdated({ ...detail, delayMs: 4000 });
  dispatchStoryDataUpdated({ ...detail, delayMs: 11000 });
}

export function storyScopeMatches(
  detail: StoryDataUpdatedDetail | undefined,
  scope: StoryRefreshScope
): boolean {
  if (!detail?.scopes?.length) return true;
  return detail.scopes.includes('all') || detail.scopes.includes(scope);
}

export function onStoryDataUpdated(
  handler: (detail: StoryDataUpdatedDetail) => void,
  scope?: StoryRefreshScope
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<StoryDataUpdatedDetail>).detail ?? {};
    if (scope && !storyScopeMatches(detail, scope)) return;
    handler(detail);
  };
  window.addEventListener(STORY_DATA_UPDATED, listener);
  return () => window.removeEventListener(STORY_DATA_UPDATED, listener);
}
