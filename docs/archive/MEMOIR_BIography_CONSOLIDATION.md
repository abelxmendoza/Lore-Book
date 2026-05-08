# Memoir & Biography Consolidation

**Date**: 2025-01-27  
**Status**: ✅ Completed

---

## 🎯 **Problem**

The app had two overlapping systems for generating life stories:
- **Memoir**: Older system using `journal_entries` directly
- **Biography**: Newer system using `NarrativeAtoms` and timeline hierarchy

This caused:
- Confusion about which system to use
- Duplication of functionality
- Biography routes depending on memoirService (confusing dependency)

---

## ✅ **Solution: Consolidate to Biography**

**Biography is now the primary system** because:
- ✅ Uses NarrativeAtoms (precomputed, structured data)
- ✅ Aligns with timeline hierarchy (chapters, arcs, sagas, eras)
- ✅ Supports multiple versions (safe, explicit, private)
- ✅ Better filtering (domain, time range, themes)
- ✅ More modern architecture

---

## 📋 **Changes Made**

### 1. **Refactored Biography Routes**

**`/api/biography/sections`** (was using memoirService):
- ✅ Now uses biography chapters from main lifestory
- ✅ Returns chapters as sections (for backward compatibility)
- ✅ No longer depends on memoirService

**`/api/biography/chat`** (was using memoirService):
- ✅ Now uses biography chapters
- ✅ Triggers biography regeneration in background
- ✅ No longer depends on memoirService

### 2. **Deprecated Memoir Routes**

All `/api/memoir/*` endpoints now:
- ⚠️ Include deprecation warnings
- ⚠️ Log warnings when called
- ⚠️ Return migration hints in responses
- ✅ Still work for backward compatibility

---

## 🔄 **Migration Guide**

### For API Consumers:

| Old Endpoint | New Endpoint | Notes |
|-------------|-------------|-------|
| `/api/memoir/outline` | `/api/biography/main-lifestory` | Returns biography with chapters |
| `/api/memoir/sections` | `/api/biography/sections` | Returns biography chapters |
| `/api/memoir/generate-section` | `/api/biography/generate` | Use `scope: 'time_range'` with period |
| `/api/memoir/generate-full` | `/api/biography/generate` | Use `scope: 'full_life'` |
| `/api/memoir/chat-edit` | `/api/biography/chat` | Biography auto-updates after chat |

### Concept Mapping:

| Memoir Concept | Biography Concept |
|---------------|----------------|
| Memoir Outline | Biography Structure |
| Memoir Sections | Biography Chapters |
| Memoir auto-update | Biography regeneration |
| Memoir generate | Biography generate |

---

## 📊 **Architecture**

### Biography System Flow:

```
Chat Messages
    ↓
Ingestion Pipeline
    ↓
NarrativeAtoms (structured data)
    ↓
NarrativeGraph (cached, indexed)
    ↓
Biography Generation (filtered, clustered)
    ↓
Biography Chapters (with titles, prose)
    ↓
Main Lifestory (auto-updated)
```

### Key Differences:

**Memoir (Old)**:
- Used `journal_entries` directly
- Had outline/sections structure
- Manual updates

**Biography (New)**:
- Uses `NarrativeAtoms` (precomputed)
- Uses timeline hierarchy
- Auto-updates via ingestion pipeline

---

## 🚀 **Benefits**

1. **Unified System**: One system for life stories
2. **Better Structure**: Timeline-aligned chapters
3. **More Flexible**: Domain filtering, time ranges, themes
4. **Version Support**: Safe, explicit, private versions
5. **Auto-Updates**: Regenerates automatically after chat

---

## ⚠️ **Backward Compatibility**

- Memoir routes still work (for now)
- Deprecation warnings logged
- Migration hints in responses
- Will be removed in future version

---

## 📝 **Next Steps**

1. ✅ Update UI to use biography endpoints only
2. ✅ Remove memoir routes in future version
3. ✅ Consider migrating existing memoir data to biographies

---

## 🔍 **Files Changed**

- `apps/server/src/routes/biography.ts` - Removed memoirService dependency
- `apps/server/src/routes/memoir.ts` - Added deprecation warnings

---

**Result**: Clean, unified system using Biography as the single source of truth for life stories.
