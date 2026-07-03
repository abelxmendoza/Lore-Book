# CRUD Audit

## Direction

Use the app's RTK Query `baseApi` as the main CRUD layer. This gives Lorekeeper the useful parts of Refine's resource/data-provider model without replacing the custom product UI.

Refine can stay useful as a separate internal admin cockpit, but production CRUD inside `apps/web` should avoid direct component-level mutation calls when a shared resource mutation exists.

## Critical Start Points

1. Characters
   - Highest risk because AI-created duplicates, wrong entities, Love links, memories, relationships, and deletion recovery all converge here.
   - Started: centralized `updateCharacter`, `deleteCharacter`, `mergeCharacters`, and `linkRomanticRelationshipToCharacter` mutations in `entitiesApi`.
   - Started: Character merge/delete panel and Love relationship linking now use shared mutations.

2. Dating & Romance
   - Relationships must resolve to the same Character Book entity before users edit identity details or delete bad characters.
   - Started: Love cards can link an Omega relationship to a Character Book record and open the shared character modal.

3. Locations and Organizations
   - Next because they have nested CRUD for members, relationships, events, stories, and locations.
   - Needed: move direct modal mutations into `entitiesApi` mutations with `Location`/`Organization` invalidation.

4. Projects and Skills
   - Lower blast radius, but they already have API wrappers that can be migrated into RTK Query resource mutations.
   - Needed: create/update/delete mutations with optimistic state where simple.

5. Memory and Timeline
   - High user trust impact; defer until entity CRUD is stable.
   - Needed: audit destructive actions, recovery paths, and cache invalidation.

## Rules For New CRUD

- Put shared server-state reads/mutations in `apps/web/src/store/api/entitiesApi.ts` or a domain API injected into `baseApi`.
- Mutations must invalidate the right tags and clear legacy `requestCache` entries when detail reads use `cachedFetchJson`.
- Component code should call `.unwrap()` and handle the user-facing error/notice locally.
- Destructive actions should carry a reason when the backend can use it for correction analytics.
- Avoid using inferred sensitive identity fields for filtering unless the value is explicit or user-confirmed.

## Refine Use

Use Refine for a private admin dashboard if needed:

- Tables for raw entities.
- Bulk edits and review queues.
- Debugging linked records.
- Internal cleanup workflows.

Do not rewrite the main Character Book, Love UI, chat, memory graph, or lore surfaces into Refine.

---

## End-to-End CRUD Status Matrix (2026-06-22 audit)

Verified by reading backend routes (`apps/server/src/routes`), services, and the
shared web mutation layer (`apps/web/src/store/api/entitiesApi.ts`). Legend:
✅ complete · ⚠️ partial / direct-fetch (not on the shared layer yet) · ❌ missing.

| Entity | Create | Read | Update | Delete | Shared mutation (entitiesApi) | Status |
|---|---|---|---|---|---|---|
| **Characters** | ✅ `POST /api/characters` (+ ensure-self, 24 posts) | ✅ `GET /books/characters`, `/self/profile` | ✅ `PATCH /:id` | ✅ `DELETE /:id`, `/:id/media/:mediaId` | ✅ update/delete/merge/linkRomantic | **COMPLETE** |
| **Organizations** | ✅ `POST /` (+ members/events/stories/locations/relationships) | ✅ `GET` | ✅ `PATCH /:id` | ✅ `DELETE /:id` + 5 nested deletes | ✅ update/delete + all add/remove nested | **COMPLETE** |
| **Romantic relationships** | ✅ `POST` | ✅ `GET /conversation/romantic-relationships` | ✅ `PATCH /:id` | ✅ `DELETE /:id` | ✅ link/update/delete | **COMPLETE** |
| **Skills** | ✅ `POST` | ✅ `GET` | ✅ `PATCH /:skillId`, `/:skillId/details` | ✅ `DELETE /:skillId` | ❌ not migrated (direct fetch) | ⚠️ works, not on shared layer |
| **Locations** | ✅ `POST` | ✅ `GET` | ✅ `PATCH /:id` | ❌ **no route, no service method** | ❌ none | ⚠️ **NO DELETE** |
| **Projects** | ✅ `POST` | ✅ `GET` | ✅ `PATCH /:id` | ❌ **no route, no service method** | ❌ none | ⚠️ **NO DELETE** |
| **Goals / Values** | ✅ `POST` | ✅ `GET /goals`, `/goals/:id`, `/values` | ✅ `PATCH /goals/:id/status`, `/values/:id/priority` | ❌ **no hard delete** (status patch only) | ❌ none | ⚠️ **NO DELETE** |
| **Events** | ✅ `POST` | ✅ `GET` (2) | ❌ **none** | ❌ **none** | ❌ none | ⚠️ **CREATE/READ ONLY** |

## Gaps fixed (2026-06-22)

- ✅ **Locations DELETE** — `DELETE /api/locations/:id` + `locationService.deleteLocation`
  (cleans up `location_character_links`); delete button in `LocationDetailModal`,
  wired in `LocationBook`. (Also fixed a pre-existing `setLocations` bug there.)
- ✅ **Projects DELETE** — `DELETE /api/projects/:id` + `projectService.deleteProject`;
  delete button in `ProjectDetailModal` (`onDelete`), wired in `ProjectBook`.
- ✅ **Goals DELETE** — `DELETE /api/goals/goals/:id` + `goalValueAlignmentService.deleteGoal`.
  (UI delete control still to be added to the goal/quest surface.)
- ✅ **Events UPDATE + DELETE** — `PATCH`/`DELETE /api/events/:id` +
  `EventStorage.updateEvent`/`deleteEvent` (cleans up `event_mentions`).
  (UI controls still to be added to the timeline/event surface.)

All backend routes are `requireAuth` + user-scoped and return 404 when the row is
absent. Frontend delete is wired for Locations + Projects; goals/events have the
backend ready for their UI pass.

## Confirmed gaps (prioritized) — original audit

1. **Locations — DELETE missing** (P1). No `DELETE /api/locations/:id` route and no
   `locationService.deleteLocation`. The Location Book can create/edit but not delete.
   Fix: add route + service (soft-delete or cascade-aware) + `deleteLocation`
   mutation in `entitiesApi` with `Location` tag invalidation. *(Cursor's stated
   next target — leave the shared-layer wiring to that pass.)*
2. **Projects — DELETE missing** (P1). Same shape as Locations: add route + service
   + `deleteProject` mutation.
3. **Goals — hard DELETE missing** (P2). Status patch can mark complete/abandoned,
   but there's no way to remove a wrongly-created goal. Add `DELETE /api/goals/goals/:id`.
4. **Events — UPDATE + DELETE missing** (P2). Create/read only; a mis-extracted
   event can't be corrected or removed. Add `PATCH` + `DELETE`.
5. **Skills — not on the shared layer** (P3). CRUD works via direct fetch; migrate
   to `entitiesApi` mutations for consistent cache invalidation.

## End-to-end verification checklist (per entity, when fixing)

- [ ] Backend route exists and is `requireAuth` + user-scoped (`eq('user_id', …)`).
- [ ] Service method exists (idempotent where applicable; cascade/soft-delete decided).
- [ ] Shared `entitiesApi` mutation with correct tag invalidation.
- [ ] UI calls the shared mutation via `.unwrap()` with a user-facing error/notice.
- [ ] `requestCache`/`cachedFetchJson` legacy entries cleared on mutate.
- [ ] Optimistic update where safe; refetch on settle otherwise.

> Note: at audit time the shared CRUD layer (`entitiesApi`, `baseApi`) and several
> modals had an **active in-progress refactor** (characters, organizations, romantic
> relationships migrated; Locations next). Gap fixes 1–5 should be done as part of
> that pass to avoid divergent mutation patterns. This matrix is the remaining-work
> map for it.
