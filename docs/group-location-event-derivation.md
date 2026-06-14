# Group modal: location & event data from conversations

## Goal
When a user opens a group/organization modal, the **Events** and **Locations**
tabs should reflect what was actually discussed across all chat threads and
journal entries — not only manually-added rows.

## Problem
`organization_events` / `organization_locations` are **manual-only** overlays.
Auto-detected groups (Los Goths, Kforce, Tía Grace's Household, …) therefore
showed empty Events/Locations tabs even when the conversations were full of
shows, venues, and gatherings.

Meanwhile the ingestion pipeline already extracts rich, character-keyed data:
- **`character_timeline_events`** — `character_id`, `event_title`, `event_date`,
  `event_summary`, `event_type`, `user_was_present` (one row per character per event).
- **`locations`** — `name`, `type`, `importance_score`, and
  `associated_character_ids uuid[]`.

## Approach (attribution by membership)
A group is its members. So we attribute events/locations to a group by the
**character_ids of its members**:

1. `organizationService.getDerivedContext(userId, orgId)`
   - Load members → collect `character_id`s (+ id→name map).
   - **Events**: `character_timeline_events` where `character_id IN members`,
     collapse rows that share an event into one card (union of involved member
     names, OR of `user_was_present`), newest first, cap 50.
   - **Locations**: `locations` where `associated_character_ids && members`
     (array overlap), ordered by importance, cap 50.
2. Route: `GET /api/organizations/:id/derived-context` → `{ events, locations }`.
3. Modal: lazy-loads on first open of Events/Locations tab and renders a
   read-only **"From your conversations"** section (purple-tinted cards) below
   the manual entries, showing date, involved members, and a "You were there"
   badge.

This is recomputed per request, so it always reflects the latest conversations
and needs no backfill or extra storage. It is read-only — manual add/remove
still drives `organization_events` / `organization_locations`.

## Event audiences (with you / without you / group-wide)

Each derived event is classified into one of three audiences:

| Audience | Meaning |
|----------|---------|
| `with_user` | You were present (`user_was_present`) |
| `without_user` | A member-only event — you weren't there |
| `group_wide` | Multiple members involved, or event type/title suggests a collective gathering (show, meeting, festival, …) |

The Timeline tab renders three swimlanes. Subgroup tags (`subgroup_names`) show when an event came from a nested group's roster (e.g. household within a family).

## Group hierarchy (subgroups & related groups)

`organization_relationships` links groups together. The inference service (`organizationRelationshipInferenceService`) learns links from:

1. **Chat text** — "X is part of Y", "inner circle of Z", household-within-family phrasing
2. **Name nesting** — "Los Goths Inner Circle" ⊃ "Los Goths"
3. **Member overlap** — smaller roster mostly contained in a larger group

Persisted edges use `[auto-inferred]` in notes. Types:
- `part_of` / `spawned_from` — subgroups (households, inner circles)
- `affiliated_with` — related peers (scene vs community)

`getDerivedContext` rolls up **subgroup member events** into the parent group modal and returns a `hierarchy` block (`parent`, `subgroups`, `related`).

Re-scan: `POST /api/organizations/reconcile-relationships` or **Learn from chat** in the Relationships tab.

## Group network graph (G1 UI)

`GET /api/organizations/network?rootOrgId=&depth=` builds a graph from `organizations` + `organization_relationships`.

- **Organizations book** → **Group Network** card (full graph)
- **Group modal** → Relationships tab → embedded graph centered on that group
- Toggle **Graph** (SVG node-link) vs **Tree** (expandable hierarchy)
- Purple dot / dashed edges = learned from chat (heuristic or LLM)

### LLM relationship extraction

When a message mentions ≥2 known organizations, `organizationRelationshipInferenceService.inferLinksFromLlm` runs alongside regex/name/overlap passes. Subtle phrasing like *"the tight-knit core of the Los Goths scene"* or *"household within my family"* is mapped to G1 types (`part_of`, `affiliated_with`, …) and stored with `[auto-inferred:llm]` notes.

## Future enhancements
- Cross-reference `memory_components` (`characters_involved` + free-text
  `location`) and `event_records` (`participant_ids` / `location_ids`) for
  members that lack a `character_id` link, matching by normalized name.
- One-click "Pin to group" to promote a derived event/location into the manual
  overlay tables.
- Fold derived locations into the group's `location` summary field.
- Time-window filtering and de-noising (drop one-off mentions below a salience
  threshold).
