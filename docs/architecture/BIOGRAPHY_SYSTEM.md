# Biography System — Architecture & Implementation

> Merged from: `BIOGRAPHY_ARCHITECTURE.md`, `BIOGRAPHY_GENERATION_IMPLEMENTATION.md`,
> `BIOGRAPHY_MENTAL_MODEL_ALIGNED.md`, `BIOGRAPHY_RECOMMENDATIONS_SYSTEM.md`,
> `MEMOIR_BIography_CONSOLIDATION.md`, `MAIN_LIFESTORY_IMPLEMENTATION.md`

---

## Core Mental Model

**Biographies are compiled views, not documents.**

```
NarrativeAtoms  →  Biography Engine  →  Biography
(AST nodes)        (compiler)           (compiled output)
```

- **NarrativeAtoms** = structured semantic units extracted from conversation
- **Engines** = analyzers that extract patterns and meaning
- **Biography** = compiled narrative view (never stored as source of truth)
- **Versions** = scope flags (`full_life`, `domain`, `time_range`, `thematic`)

**Core principle:** `Structure first. Narrative second. Prose last.`
- Never generate from raw journal dumps
- Always use precomputed NarrativeAtoms
- Reuse cached atoms across multiple biography versions

---

## Data Structures

### NarrativeAtom
```typescript
type NarrativeAtom = {
  id: string
  timestamp: Date
  domain: Domain[]            // fighting, robotics, relationships, etc.
  type: AtomType              // event | conflict | reflection | achievement
  emotionalWeight: number     // 0..1
  sensitivity: number         // 0..1 (content filtering)
  significance: number        // 0..1
  people?: string[]
  tags?: string[]
  content: string             // Pre-summarized text
  timelineIds: string[]
  sourceRefs: string[]
}
```

### BiographySpec
```typescript
type BiographySpec = {
  scope: 'full_life' | 'domain' | 'time_range' | 'thematic'
  tone: 'neutral' | 'dramatic' | 'mythic' | 'professional'
  depth: 'summary' | 'detailed' | 'epic'
  audience: 'self' | 'public' | 'professional'
  version: 'main' | 'safe' | 'explicit' | 'private'
}
```

---

## Implementation Status

### Backend (Implemented ✅)
- `services/biographyGeneration/types.ts` — NarrativeAtom, BiographySpec types
- `services/biographyGeneration/narrativeAtomBuilder.ts` — builds atoms from timeline entries
- `services/biographyGeneration/biographyGenerationEngine.ts` — core generation engine
- `services/mainLifestoryService.ts` — main lifestory biography (auto-updates after chat)

### API Endpoints (Implemented ✅)
- `GET /api/biography` — get current biography
- `POST /api/biography/generate` — generate new version
- `GET /api/biography/versions` — list past versions
- `GET /api/memoir` — get memoir (user-controlled version)

### Frontend (Implemented ✅)
- Biography viewer component
- Memoir editor
- Version history

---

## Memoir vs Biography

| | **Memoir** | **Biography** |
|-|-----------|--------------|
| **Authored by** | User (curated) | System (compiled from conversation) |
| **Editable** | Yes | No (read-only view) |
| **Source** | Journal entries + manual input | NarrativeAtoms from all conversation |
| **Tone** | User-defined | System-generated |
| **Updates** | Manual | Auto-updates after each chat |

---

## Recommendations System

Biography recommendations surface when the system detects significant life events, pattern completion, or narrative arc closures. They suggest generating a new biography version or adding a memoir entry.

**Triggers:**
- Chapter completion
- Significant character change detected
- Long period without biography update (> 30 days)
- User explicitly requests

---

## Key Files

| File | Purpose |
|------|---------|
| `services/biographyGeneration/` | Core generation engine |
| `services/mainLifestoryService.ts` | Auto-update after chat |
| `services/memoirService.ts` | Memoir management |
| `routes/biography.ts` | API endpoints |
