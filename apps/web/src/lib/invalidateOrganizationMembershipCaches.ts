/**
 * Clear client caches that back character ↔ group membership UI.
 * Call after add/remove member so Character modal Groups sections refetch fresh data.
 *
 * Important: do NOT invalidate by bare character UUID — that also drops
 * `/api/characters/:id/profile-bundle` and can leave the character modal stuck
 * on "Loading character details...".
 */
import { apiCache } from './cache';
import { invalidateCache } from './requestCache';

const MEMBERSHIP_API_PATTERN =
  /\/api\/(organizations|family-trees\/character\/[^/]+\/affiliations|family-trees\/organization\/[^/]+\/member-affiliations|books\/organizations|group-candidates)(\/|\?|$)/;

export function invalidateOrganizationMembershipCaches(options?: {
  characterIds?: string[];
  organizationIds?: string[];
}): void {
  apiCache.deletePattern(MEMBERSHIP_API_PATTERN);
  apiCache.deletePattern(/\/api\/organizations\/by-character/);
  invalidateCache('/api/organizations/by-character');
  invalidateCache('/api/organizations');
  invalidateCache('/api/family-trees/character/');
  invalidateCache('/api/family-trees/organization/');

  for (const id of options?.organizationIds ?? []) {
    if (!id) continue;
    // Org detail + nested member routes only — not every URL containing the id.
    invalidateCache(`/api/organizations/${id}`);
    apiCache.deletePattern(
      new RegExp(`/api/organizations/${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|\\?|$)`),
    );
  }

  for (const id of options?.characterIds ?? []) {
    if (!id) continue;
    const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Membership lookups for this person only.
    invalidateCache(`/api/organizations/by-character?character_id=${id}`);
    invalidateCache(`/api/family-trees/character/${id}/affiliations`);
    // Lore Info-tab groups — scoped path only (never bare UUID / profile-bundle).
    invalidateCache(`/api/characters/${id}/lore-profile`);
    apiCache.deletePattern(
      new RegExp(`/api/organizations/by-character\\?character_id=${safeId}`),
    );
    apiCache.deletePattern(
      new RegExp(`/api/family-trees/character/${safeId}/affiliations`),
    );
    apiCache.deletePattern(new RegExp(`/api/characters/${safeId}/lore-profile`));
  }
}
