---
name: intelligence-visibility-sprint
description: Intelligence visibility sprint — 6 features exposing LoreBook's cognition layer in chat and relationship UI (2026-05-31)
metadata:
  type: project
---

Sprint focus: expose existing intelligence, not build new intelligence.

**What was built:**

1. **"About Me" tab in Perceptions** — `SelfKnowledgeView.tsx` + `EvidenceInspectorModal.tsx`. Tab toggle at top of PerceptionsView. Crystallized_knowledge ≠ Perceptions (outward beliefs about others). `apps/web/src/api/knowledge.ts` created.

2. **"What LoreBook Knows" strip in chat** — `WhatLoreBookKnows.tsx`. Collapsible strip above composer, shows top ACTIVE claims with confidence. Calls `GET /api/knowledge/claims?status=ACTIVE&min_confidence=0.6`.

3. **Active Context Panel** — `ActiveContextPanel.tsx`. Collapsible right panel (desktop-only, 256px). Brain button in header toggles it. Sub-tabs: Knowledge / Life Arcs. New backend endpoint: `GET /api/knowledge/chat-context` (bundles claims + arcs in one call). Persisted in localStorage.

4. **Life Impact tab in RelationshipDetailModal** — 6th tab "Life Impact". Calls `GET /api/conversation/romantic-relationships/:id/influence` on-demand. Shows autobiographical impact score, life arcs influenced, knowledge crystallized, aftermath, cross-relationship patterns.

5. **Chronology Narrative modal** — `ChronologyNarrativeModal.tsx`. BookOpen button in chat header (desktop). Era presets (3/6/12/24 months). Calls `GET /api/chronology/narrative`. Shows narrative, patterns, gaps, event sequence.

6. **Fork Thread** — `POST /api/conversation/threads/:id/fork` (takes optional `message_id`, copies messages up to fork point). `forkThread()` in `useConversationRuntime`. GitBranch button per message in `ChatMessage`. Wired through `ChatMessageList` → `ChatFirstInterface`.

**Why:** "The intelligence layer is where LoreBook wins" — sprint about visibility, explainability, user understanding.

**How to apply:** When adding new backend intelligence (knowledge, arcs, relationships), always ask: is there a frontend surface that exposes this? The pattern established here is: backend exists → thin aggregation endpoint → component with on-demand load.
