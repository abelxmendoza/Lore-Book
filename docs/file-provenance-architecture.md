# File Provenance Architecture

**Date:** 2026-06-16

---

## Principle

Every graph object created from a file must answer: **"Where did this come from?"**

No OpenAI Files. LoreBook owns storage and traceability in Supabase.

---

## Canonical registry: `user_files`

```sql
user_files (
  id, user_id, filename, mime_type, sha256,
  storage_url, uploaded_at, processing_status,
  ingest_kind, derived_counts, metadata, error_message
)
```

- **SHA-256 dedup** per user — re-uploading same file reuses registry row.
- **`derived_counts`:** `{ moments, facts, entities, relationships, events }`
- **`metadata.provenance_links`:** `[{ type, id }, ...]` append-only audit trail.

---

## Provenance fields by object type

| Object | Field | Status |
|--------|-------|--------|
| Moment (`journal_entries`) | `metadata.source_file_id` | ✅ Implemented |
| Moment | `metadata.user_file_id` | ✅ Same as source_file_id |
| Character | `metadata.source_file_id` | ✅ On document import |
| Entity fact | via `user_files.provenance_links` | ✅ Resume path |
| Profile claim | `metadata.source_file_id` | ✅ Resume path |
| Relationship | recovery pass (no file id yet) | ⚠️ Phase 2 |
| Timeline event | recovery pass (no file id yet) | ⚠️ Phase 2 |

---

## Ingestion flow with provenance

```
upload (multer buffer)
  → userFileRegistry.registerOrReuse()     // sha256, storage_url
  → fileNormalizer.normalizeDocument()     // text + detectedDate
  → memoryService.saveEntry({ metadata: { source_file_id } })
  → ingestJournalEntry()                   // existing ER path
  → relationshipFoundationService.recoverRelationshipGraph()
  → eventRecoveryService.recoverMissingEvents()
  → userFileRegistry.updateDerivedCounts()
  → userFileRegistry.appendProvenanceLink()
```

---

## UI design: "Where did this come from?"

### Character detail

```
Evidence files
  └─ resume.pdf (uploaded 2026-06-16)
       ├─ 12 career facts
       └─ 1 moment
```

Query:

```sql
SELECT * FROM user_files
WHERE metadata->'provenance_links' @> '[{"type":"journal_entry","id":"<entry_id>"}]';
-- or reverse: journal_entries.metadata->>'source_file_id' = user_files.id
```

### Event / relationship (Phase 2)

Add `metadata.source_file_id` on `character_timeline_events` and `character_relationships` when created during file ingest recovery pass.

### API (proposed)

```
GET /api/files/:id              → user_file + provenance_links
GET /api/files/:id/derivatives  → moments, facts, entities linked
GET /api/characters/:id/sources → all source_file_ids
```

---

## Trust rules

1. **Never** create graph edges without a `source_file_id` when origin is a file upload.
2. **Prefer** `memoryService.saveEntry` over direct `journal_entries` insert.
3. **Dedup** files by SHA-256 before re-processing.
4. **Surface** provenance in UI before showing high-confidence recall answers.
