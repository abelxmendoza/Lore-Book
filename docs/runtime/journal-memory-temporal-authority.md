# Journal Memory Temporal Authority

**Status:** next-session first mission. Do not start this while shipping green branches.

**Do not** create another temporal model. **Do not** rewrite ingestion.

Reuse `CanonicalTemporalModel`, stitched chronology, and `projectTemporalItem` / `temporalSurfaceProjection`.

---

## Why this exists

Character Story still merges journal memories using the memory’s date, while canonical events use `CanonicalTemporalModel`.

That means the same autobiographical moment can be correctly dated everywhere else while its journal-memory representation sorts somewhere different. Quiet authority leak.

## Invariant

Journal record timestamps must not masquerade as life occurrence time.

| Clock | Meaning | Allowed use |
| --- | --- | --- |
| Recording / journal timestamp | When the user wrote it down | Metadata only |
| Mentioned time | When the text referred to it | Evidence, not occurrence |
| `memory.date` | Often a write-time or ingest-time field | Not occurrence unless it already *is* projected occurrence |
| Actual occurrence | When it happened in the life | `CanonicalTemporalModel` + shared projection |

## Mission

1. Trace `memory.date`, journal timestamps, recording time, mentioned time, and actual occurrence time through Character Story, Timeline, Calendar, subject timelines, and journal-derived chronology.
2. Determine which journal memories can resolve to an existing canonical event.
3. Project those through the existing temporal authority (`CanonicalTemporalModel` → `projectTemporalItem`).
4. Keep genuinely unresolved memories unresolved. Do not invent occurrence dates.
5. Preserve journal timestamps strictly as metadata.
6. Ensure no surface can manufacture a competing date for the same moment.

## Known leak (starting point)

`apps/web/src/components/characters/CharacterStoryPanel.tsx` builds a mixed story list:

- Events use `event.eventDate` (canonical path).
- Memories use `memory.date`, then sort both together by `new Date(a.date)`.

Related read-path consumers of `memory.date` as if it were occurrence:

- `apps/web/src/components/characters/CharacterSharedTimeline.tsx`
- `apps/web/src/components/characters/CharacterDetailModal.tsx`
- `apps/web/src/components/timeline-v2/TimelinePageV2.tsx` (`start_time: memory.date`)
- `apps/web/src/components/timeline/ColorCodedTimeline.tsx`
- `apps/web/src/components/locations/LocationDetailModal.tsx`

Authority already exists. Do not fork it:

- `apps/server/src/services/temporal/canonicalTemporalModel.ts`
- `apps/server/src/services/temporal/temporalSurfaceProjection.ts`
- `apps/server/src/services/chronologyV2/stitchedTimelineService.ts`
- `apps/server/src/services/chronologyV2/calendarAggregationService.ts`

## Constraints

- No new temporal model.
- No ingestion rewrite.
- Do not reopen Character Timeline / Omni / Calendar cutover unless a journal-memory date is still leaking onto those surfaces.
- Do not apply migrations, deploy, or mix this with dating/identity WIP.
- Founder PII rules still apply.

## Suggested tests

- Memory whose journal timestamp ≠ canonical occurrence sorts with the event, not the write.
- Unresolved journal memory stays unresolved and does not mint a calendar/timeline date.
- Journal timestamp still visible as recorded-at metadata.

---

## Session closeout — 2026-08-20

Journal-memory work was **not** started tonight. Remaining time went to landing green parallel work.

### Shipped

- Worktree: `/Users/abel_elreaper/Desktop/projects/lorekeeper-composer-perf`
- Branch: `perf/composer-hot-path` @ `6ab9459f` (pushed)
- Focused tests: 28 web + 30 server, all passing
- Full server hook suite: 892 files passed
- Web hook suite: pre-existing failures outside this diff (`zod` resolve, CharacterDetailModal Whittier household, EntityChipsRow Jimmy collapse, api-contracts mirrorParity). Not fixed; do not expand into those.
- Scope: composer keystroke hot path only (draft persist debounce, chat-screen unsubscription from raw draft, message-list memo, preview abort/cache, server TTL memo)
- Hook unblocks only (not new product work): `Genni` → `Jamie` in two already-on-main tests; TTL memo skipped under `VITEST`; karate lexical fixture no longer contains the substring `my ex`

### Intentionally preserved (do not dump into one commit)

Primary checkout: `/Users/abel_elreaper/Desktop/projects/lorekeeper`  
Branch: `fix/revoke-anon-security-definer-rpcs` @ `8efa7468` (behind `origin/main`)

This working tree is a mixed, uncommitted pile. Leave it on disk. Do not commit it as one blob onto the security branch.

Slices present in the dirty tree (non-exhaustive):

| Slice | Notes |
| --- | --- |
| Anon RPC / export-view hardening | Staged: `supabase/migrations/20260819000000_*`, `20260819010000_*`, related scripts, `package.json` |
| Relationship history extras | Untracked `characterRelationshipHistory*` + review SQL `20260821010000_character_relationship_history.sql` (history already landed on main as `576b181c`) |
| What’s new first-open reel | `apps/web/src/data/whatsNew*`, `DevelopmentNotice*`, `vite.whatsNewPlugin.ts` |
| Lore of LoreBook | `lorebookPublicChronicle`, `projectChronicleSeed`, lore page season band |
| Dating / identity / chat retarget | Many untracked identity + dating-book files — keep off temporal/security commits |
| Character entity timeline / temporal projection | Untracked `temporalSurfaceProjection*` — Phase 3 cutover; do not reopen unless asked |

Other local branches (`fix/calendar-*`, `fix/character-book-blank-screen`, etc.) are behind main; treat as already-merged leftovers unless a unique commit appears.

### Stashes (untouched)

```
stash@{0}: On main: local WIP before pulling 4 remote commits (2026-08-19 13:04)
stash@{1}: On main: wip aside: not tonight's chat retarget
stash@{2}: On fix/chat-thread-chronological-order: wip-storyOfSelf-and-other-unstable
stash@{3}: On fix/chat-thread-chronological-order: aside2
stash@{4}: On main: main-wip-aside
stash@{5}: On codex/response-scope-correction-inheritance: wip-other
```

### Later, after this mission

`resolvePrimaryEntity()` source-attribution cleanup. Read-path guard only until then.
