# File Ingestion Audit v2

**Date:** 2026-06-16  
**Sprint:** File Ingestion Consolidation

---

## Executive summary

- **OpenAI Files API:** Not used. Not planned.
- **Critical bug:** Confirmed and fixed — `/api/documents/upload` was calling `buffer.toString('utf-8')` on PDF/DOCX binaries.
- **Canonical path:** `unifiedFileIngestionService` now owns document + resume uploads.
- **Registry:** `user_files` table tracks every artifact with SHA-256 dedup and derived counts.

---

## Write-path map (pre-consolidation)

### `journal_entries` — **1 canonical writer**

| Writer | Path | Trigger |
|--------|------|---------|
| `memoryService.saveEntry()` | `apps/server/src/services/memoryService.ts` | **All moments** |

Callers (must flow through `saveEntry`):

| Caller | Source tag | File provenance |
|--------|------------|-----------------|
| `documentService` | `document_upload` | ✅ `source_file_id` (new) |
| `photoService` / `photoAnalysisService` | `photo` / `photo_document` | ❌ not yet |
| `entries.ts` voice route | `manual` + `voice` metadata | ❌ not yet |
| `chatGPTImportService` | `chatgpt_import` | ❌ bypasses saveEntry today |
| `chatOrchestrator` | chat save | ❌ |
| `memoryExtractionService` | extraction | ❌ |
| 15+ other services | various | ❌ |

### `entity_facts` — primary writer

| Writer | Path |
|--------|------|
| `entityFactsService.upsertFact()` | chat/journal extraction pipeline |
| `unifiedFileIngestionService` | resume → Me character facts (new) |
| `relationshipFoundationService` | reads facts, does not write |
| `characterMergeService` | merge operations only |

### `profile_claims` — resume silo

| Writer | Path |
|--------|------|
| `profileClaimsService.createClaim()` | resume upload only |

### `fact_claims` — ChatGPT import silo

| Writer | Path |
|--------|------|
| `chatGPTImportService.importFacts()` | direct insert |
| `truthVerificationService` | verification upsert |

### `original_documents` — document text archive

| Writer | Path |
|--------|------|
| `documentService.storeOriginalDocument()` | document upload |

### `resume_documents` — resume archive

| Writer | Path |
|--------|------|
| `resumeParsingService.createResumeDocument()` | resume upload |

---

## Confirmed bug: PDF/DOCX on documents route

**Before:**

```typescript
const fileContent = req.file.buffer.toString('utf-8'); // corrupts binary
await documentService.processDocument(userId, fileContent, ...);
```

`documentService.extractText()` only handled plain text — PDF/DOCX produced garbage.

**After:**

```typescript
await unifiedFileIngestionService.ingest({
  buffer: req.file.buffer,
  kind: 'document',
});
```

Shared `fileTextExtractor.ts` uses `pdf-parse` + `mammoth` (same as resume path).

**Tests:** `tests/routes/documents.test.ts` verifies buffer is passed unchanged.

---

## Storage map

| Asset | Location |
|-------|----------|
| All uploads (new) | `user_files` + Supabase `user-files` bucket |
| Document text | `original_documents` |
| Resume text + claims | `resume_documents` + `profile_claims` |
| Photo binaries (optional) | Supabase `photos` bucket |
| Moments | `journal_entries` |

---

## Sprint changes implemented

| Component | File |
|-----------|------|
| `user_files` migration | `supabase/migrations/20260616120000_user_files.sql` |
| Shared PDF/DOCX/txt extraction | `apps/server/src/lib/fileTextExtractor.ts` |
| File registry | `apps/server/src/services/ingestion/userFileRegistry.ts` |
| Normalizer | `apps/server/src/services/ingestion/fileNormalizer.ts` |
| Unified ingestion | `apps/server/src/services/ingestion/unifiedFileIngestionService.ts` |
| Documents route fix | `apps/server/src/routes/documents.ts` |
| Resume route → unified | `apps/server/src/routes/resume.ts` |
| Provenance on moments | `journal_entries.metadata.source_file_id` |

---

## Still fragmented (next sprint)

| Path | Status |
|------|--------|
| Photo upload | Not yet routed through `unifiedFileIngestionService` |
| Voice `/api/entries/voice` | Not yet routed |
| ChatGPT import | Direct `journal_entries` insert — merge to `saveEntry` |
| Chat attachments | Not implemented |
