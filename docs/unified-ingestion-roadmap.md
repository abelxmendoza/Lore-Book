# Unified Ingestion Roadmap

**Date:** 2026-06-16  
**Goal:** 5 ingestion paths → 1 canonical path

---

## Architecture deletion matrix

| Component | Verdict | Action |
|-----------|---------|--------|
| `fileTextExtractor.ts` | **KEEP** | Single parser for txt/md/pdf/docx |
| `resumeParsingService.extractTextFromFile` duplicate | **DELETE** | Delegates to `fileTextExtractor` ✅ |
| `documentService.extractText` (broken) | **DELETE** | Removed ✅ |
| `documents.ts` utf-8 buffer hack | **DELETE** | Fixed ✅ |
| `original_documents` table | **KEEP** | Text archive; link via `user_files` |
| `resume_documents` table | **KEEP** | Resume-specific archive |
| `profile_claims` table | **KEEP** | Career claims; also mirror to `entity_facts` ✅ |
| `fact_claims` (ChatGPT) | **MERGE** | Route through `saveEntry` + unified ingest |
| `photoService` direct upload | **MERGE** | Route through `unifiedFileIngestionService` |
| `voiceService` + entries route | **MERGE** | `kind: 'voice'` through normalizer |
| OpenAI Files API | **DELETE** | Never add |

---

## Phase status

### ✅ Phase 1 — Canonical file registry

- `user_files` table + RLS
- `userFileRegistry` service
- Supabase `user-files` bucket (create in dashboard if missing)

### ✅ Phase 2 — File normalizer

- `FileNormalizer` → `NormalizedArtifact`
- Shared `fileTextExtractor`

### ✅ Phase 3 — Unified ingestion (documents + resume)

- `unifiedFileIngestionService.ingest()`
- `/api/documents/upload` → unified
- `/api/resume/upload` → unified
- Graph recovery after ingest

### ✅ Phase 4 — Provenance (partial)

- `source_file_id` on journal entries + characters
- `provenance_links` on `user_files`
- Resume claims → `entity_facts` on Me

### 🔄 Phase 5 — Resume integration (partial)

- ✅ Claims mirrored to `entity_facts`
- ✅ Summary moment created
- ⏳ Career timeline events from resume (use `eventRecoveryService` patterns)
- ⏳ Coworker edges from employer names

### ⏳ Phase 6 — Photo + video moments

Current photo path:

```
/api/photos/analyze → vision (inline base64, not stored)
/api/photos/process → optional Supabase photos bucket + journal entry
/api/photos/upload  → metadata only, often discarded (EXIF stub)
```

Target:

```
ingest({ kind: 'photo' }) → store binary → vision → saveEntry → graph recovery
```

Video: extract audio → Whisper → same path.

### ⏳ Phase 7 — Chat attachments

Feasibility: **High**

- `ChatComposer` already has `DocumentUpload` paperclip
- Add `multipart` to chat stream route OR pre-ingest via `/api/files/upload` then attach `userFileId` to message metadata
- Chat answers cite `user_files.id` in working memory packet

### ⏳ Phase 8 — Provenance UI

- Character detail: "Evidence files" section
- Event detail: source file link
- Relationship detail: fact file origins

### ⏳ Phase 9 — Full consolidation

Remaining direct writers to eliminate:

1. `chatGPTImportService` → `unifiedFileIngestionService.ingest({ kind: 'chat_import' })`
2. `photoAnalysisService.processPhoto` → unified
3. `entries.ts` voice → unified
4. Remove parallel `documentService.processDocument(string)` legacy callers

---

## Commands

```bash
# Run ingestion tests
cd apps/server && npx vitest run tests/lib/fileTextExtractor.test.ts tests/services/fileNormalizer.test.ts tests/routes/documents.test.ts

# Apply migration
supabase db push   # or run 20260616120000_user_files.sql

# Create storage bucket (Supabase dashboard)
# Bucket name: user-files (public or signed URLs)
```

---

## Success metrics

| Metric | Before | Target |
|--------|--------|--------|
| PDF upload produces readable text | ❌ | ✅ |
| Upload traceable to moments | Partial | 100% via `user_files` |
| Resume feeds life graph | profile_claims only | + entity_facts + moments |
| Ingestion code paths | 5 | 1 (+ thin kind adapters) |
