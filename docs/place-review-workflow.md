# Place Review Workflow

## Principle

**Never silently merge.** All consolidation goes through user confirmation with visible reason, confidence, and evidence.

## Review surfaces

### 1. Suggested Location Merges (`LocationMergePanel`)

Located in the Places Book. Loads:

```
GET /api/locations/duplicates
GET /api/locations/merge-suggestions
```

Each suggestion shows:

- **reason** — exact duplicate, venue alias, name containment
- **confidence** — 0–1 score from `placeDuplicateScore()`
- **evidence** — canonical names, token overlap
- **affected locations** — source cards to consolidate

User picks survivor → `POST /api/locations/merge`.

### 2. Detected Location Suggestions

New places from conversation extraction appear as suggestions before becoming cards (`DetectedLocationSuggestions`).

### 3. Location audit

`GET /api/locations/audit` returns full domain health for engineering review. Markdown export via `locationDomainAuditService.toMarkdown()`.

## Review checklist

Before confirming a merge:

1. Are both names referring to the same physical place?
2. Is one an event title (anniversary, show) rather than a venue?
3. Is one a room that should nest instead of merge?
4. Does the survivor have the correct `spatial_category`?

## Event review

When an event-as-place is detected:

- It is flagged `root_type: EVENT`
- Hidden from top-level grid
- `metadata.linked_venue_name` points to canonical venue
- User can later create/link the event in the Events surface

## Possessive review

When `Abuela's House` is detected:

- Place card: "Abuela's House" (or normalized "House" with owner metadata)
- Character link: Abuela
- Relationship: LIVES_AT / HOME_OF
- **Do not** create a character named "Abuela's House"

## Room review

When `Family Kitchen` is detected:

- Not shown as top-level card
- `parent_location_id` set to household
- Visible inside household detail → Rooms section

## Manual merge flow

1. Enable selection mode in Places Book
2. Select 2+ cards OR use duplicate group quick-merge
3. Choose survivor (highest visit count / importance recommended)
4. Confirm merge
5. Aliases preserved on survivor metadata

## Character parallel workflow

Character Book uses the same pattern:

- `DetectedCharacterSuggestions` — review before add
- `POST /api/characters/rescan` — replay conversations
- Character cards open `CharacterDetailModal` on click
