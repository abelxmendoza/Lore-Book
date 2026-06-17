# Entity Visibility Implementation Plan

**Date:** 2026-06-17  
**Sprint:** Chat Memory Utilization (Phase 4)  
**Prior spec:** [`docs/entity-visibility-report.md`](entity-visibility-report.md)

---

## Executive Summary

Phase 4 replaces legacy `people_places` substring chips with **character/location/org book + omega entity** lookups. Shipped in this sprint as foundation; post-chat ingestion panel remains Phase 2.

| Deliverable | Status |
|-------------|--------|
| Replace `people_places` chip source | ✅ Done |
| Show omega entities with confidence | ✅ Done |
| Show provenance (book vs detected) | ✅ Done |
| Dashed border for `mentioned_only` | ✅ Done |
| Post-chat full extraction panel | 🔲 Next |
| SSE async ingestion entities event | 🔲 Next |

---

## What changed (shipped)

### Server — `messageEntityDisplayService.ts`

New service: `resolveMessageEntitiesForDisplay(userId, message)`

**Resolution order:**
1. `characters` + `locations` via `detectMentionedEntities()` (alias-aware, match score)
2. `organizations` by name substring
3. `omega_entities` by name match — adds detected-but-not-promoted entities

**Returns per chip:**
```typescript
{
  id, name, type,
  confidence: 0.55–1.0,
  provenance: 'character_book' | 'location_book' | 'organization_book' | 'omega_entity',
  mentionStatus?: 'confirmed' | 'mentioned_only'
}
```

### Server — `omegaChatService.ts`

Both `chatStream()` and `chat()` now call `resolveMessageEntitiesForDisplay` instead of `peoplePlacesService.listEntities()` substring filter.

Metadata field `mentionedEntities` extended with optional `confidence`, `provenance`, `mentionStatus`.

### Client — `EntityChipsRow.tsx`

- Label changed: `mentioned:` → `detected:`
- Tooltip shows provenance + confidence + mention status
- Dashed border + `?` suffix for omega / `mentioned_only` entities
- Exported `EntityChip` type for reuse

---

## Architecture

```
User sends message
  ↓
omegaChatService (sync)
  ↓
resolveMessageEntitiesForDisplay()
  ├── characters / locations / organizations (books)
  └── omega_entities (detected, not yet promoted)
  ↓
SSE metadata.mentionedEntities → client
  ↓
EntityChipsRow (per assistant message)

Parallel (async, unchanged):
  ingestionQueue → omega extract → resolve → persist
  ↓
chat_messages.metadata.entity_ids (post-async)
  ↓
NOT YET surfaced in UI ← Phase 4b
```

---

## Phase 4b — Post-chat ingestion panel (next)

### API

```
GET /api/conversation/threads/:threadId/messages/:messageId/entities
```

Response:
```json
{
  "entities": [
    {
      "id": "uuid",
      "name": "Kelly",
      "type": "character",
      "confidence": 0.85,
      "provenance": "omega_entity",
      "mentionStatus": "mentioned_only",
      "sourceMessageId": "uuid",
      "createdAt": "ISO"
    }
  ],
  "relationships": [],
  "events": []
}
```

Sources: `entity_conversation_links`, ingestion pipeline return payload, `omega_entities`.

### Client component

`PostChatEntityPanel.tsx` — below assistant message, grouped:

| Group | Types |
|-------|-------|
| People | PERSON, CHARACTER |
| Places | LOCATION |
| Organizations | ORG |
| Events | EVENT |

Actions: View in book · Confirm · Dismiss

### SSE event (optional)

After `ingestionQueue` completes:

```json
{ "type": "entities", "data": { "messageId": "...", "entities": [...] } }
```

Client merges into message state — closes async gap.

---

## Phase 4c — Trust & provenance UI

Every chip/panel row shows:

| Field | UI |
|-------|-----|
| Source conversation | "From this chat" link |
| Evidence count | "Mentioned 3×" |
| Confidence | High / Medium / Low badge |
| Creation source | "Auto-detected" vs "Character Book" |

Reuse provenance tiers from [`docs/entity-auto-creation-policy.md`](entity-auto-creation-policy.md).

---

## Testing plan

### Unit

```typescript
// messageEntityDisplayService.test.ts
- book match returns confidence 1.0, provenance character_book
- omega mentioned_only returns dashed-eligible mentionStatus
- org name in message returns organization_book
- dedupes book entity vs omega same name
```

### Integration

1. Send message mentioning known character → chip shows solid border, character_book provenance
2. Send message with new name → after ingestion, omega chip with dashed border
3. Refresh → chips from metadata persist (stored on assistant message metadata)

### Manual

- Chat "Tell me about Abuela" → detected: Abuela chip with tooltip confidence
- Hover chip → provenance label visible

---

## Migration notes

- **No DB migration required** for Phase 4a
- Old messages retain prior `mentionedEntities` in metadata (people_places IDs may differ from book IDs — refresh on new messages only)
- `people_places` table still used by journal path and RAG lore cache — not removed

---

## Files touched

| File | Change |
|------|--------|
| `apps/server/src/services/chat/messageEntityDisplayService.ts` | **New** |
| `apps/server/src/services/omegaChatService.ts` | Chip source swap |
| `apps/server/src/services/chat/contextScoringService.ts` | Fix prompt context drops |
| `apps/web/src/features/chat/message/EntityChipsRow.tsx` | Provenance UI |
| `apps/server/scripts/chatMemoryUtilizationAudit.ts` | **New** audit script |

---

## Success criteria

- [x] Chat chips no longer use `people_places` substring match
- [x] Omega detected entities visible before Character Book promotion
- [x] Confidence and provenance in chip tooltip
- [ ] Post-chat panel shows async ingestion output within 5s
- [ ] User can confirm/dismiss detected entities without leaving chat
