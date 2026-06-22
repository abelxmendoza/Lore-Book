# Character card audit reference

## API endpoints (admin-authenticated LoreBook server)

- `GET /api/characters/card-audit` — full audit report for authenticated user
- `POST /api/characters/card-audit/apply` — apply safe fixes (`{ dryRun?: boolean }`)
- `GET /api/characters/suggestions?rescan=true` — rescan + person suggestions + `cardReviewSuggestions`
- `POST /api/characters/card-audit/review/:characterId/resolve` — `{ action: "keep" | "delete" }`

## Rescan card audit fields

Rescan summary may include:

```json
{
  "cardAudit": {
    "autoRemoved": 0,
    "queuedForReview": 0,
    "deletedAfterThreeStrikes": 0,
    "reviewSuggestions": []
  }
}
```

## Examples

**Confident delete:** title `foo`, status `junk_test_data`

**Confident merge:** `Tío Ralph's` → merge into `Tio Ralph`, alias possessive form

**Review queue:** `Cousin` without story context → round 1/3, user must Keep or Delete in suggestions panel

**Keep:** `Tía Grace`, `Goth Tio` — valid family/nickname identities
