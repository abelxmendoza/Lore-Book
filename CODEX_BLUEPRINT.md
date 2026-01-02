# CODEX v2 — Lore Keeper Intelligence Blueprint
**Author:** Abel “El Reaper” Mendoza  
**System:** Lore Keeper OS

---

## 0. Philosophy
Codex is the brainstem of Lore Keeper:
- Ingests data from across platforms (GitHub, Instagram, X/Twitter, Calendar, Photos, Audio, Manual).
- Compresses and abstracts chaos into meaning.
- Updates the user’s Lore, Timeline, Characters, Identity, and Patterns.
- Produces insights, summaries, and continuity checks.
- Avoids storing raw data unless explicitly needed.
- Remains structured, opinionated, and lightweight.

**Codex = Ingestion → Compression → Synthesis → Lore Update.**

---

## 1. Ingestion Layer (Input → Normalized Memory Blocks)
### Supported Sources
- Manual journal entries
- Photos (metadata + location context)
- Calendar events
- GitHub (commits, issues, PRs, releases)
- X/Twitter (posts, threads, bookmarks)
- Instagram (posts, stories, reels)
- Voice memos → Whisper transcripts
- File uploads (PDFs, notes, docs)
- System logs (optional)

### Output Format (MemoryBlock)
```ts
MemoryBlock {
  id: string,
  timestamp: ISODateString,
  source: "manual" | "photo" | "calendar" | "github" | "x" | "instagram" | "audio" | "file" | "system",
  content: string,                // primary text
  metadata: Record<string, any>,  // location, tags, repo, file, device, etc
  actors: string[],               // people involved
  tags: string[],                 // auto or manual
}
```

Everything is flattened into MemoryBlocks. No raw GitHub dumps, no full Instagram graphs, no clutter.

---

## 2. Filter Layer (Pruning, Condensing, Signal Extraction)
### 2.1 Relevance Filter
Reject noise:
- Trivial commits
- Short social posts
- Low-content photos
- Duplicated calendar events

### 2.2 Summarization Filter
Compress long-form inputs into:
- Core meaning
- Key actions
- Emotional tone
- Notable achievements
- Dependencies / context

### 2.3 GitHub Special Logic
**Raw → Filter → Summary**

Input: commit messages, diff previews, PR descriptions.  
Output: what changed, why it mattered, what progress occurred, what milestone is approaching.

No tech spam in Lore—only insight-level summaries.

---

## 3. Synthesis Layer (The Heartbeat of Codex)
Codex turns MemoryBlocks into meaning via specialized engines:
- **Tag Engine:** semantic tagging, topic detection, emotional tone tagging.
- **Chapter Engine:** maps life events to chapters; auto-splits and transitions; detects new arcs.
- **Persona Engine:** updates user identity model; tracks temporary & persistent traits; adjusts AI response.
- **Character Engine:** updates relationship graph; ties memories to people; strength/closeness calculation.
- **Insight Engine:** correlation and pattern detection; behavioral cycles; anomalies and turning points.
- **Continuity Engine:** canonical truth tracking; conflict detection; resolves inconsistencies; draft vs. canon.
- **Autopilot Engine:** task suggestions; habit recommendations; life optimization.
- **Identity Pulse:** tracks Abel’s evolution; outputs identity heartbeat.

---

## 4. Lore Update Layer (Memory → Story)
Each synthesized memory updates:
- Omni-Timeline
- Saga (narrative arc)
- Identity Model
- Relationship Graph
- Tag Cloud
- Memory Fabric
- HQI graph
- Monthly Canon

Codex determines placement, involvement, meaning, patterns, and significance for every update.

---

## 5. Output Layer (What Codex Produces)
- **Lore Entry:** readable journal-like version.
- **Summary:** daily, weekly, monthly, chapter-level.
- **Insight Cards:** short meaning bursts (e.g., milestones, motivation, relationship trends).
- **Continuity Warnings:** flag conflicting facts (dates, people, contradictions).
- **Pattern Reports:** cycles, habits, emotional oscillations.
- **Identity Updates:** new traits, shifting values, personality drift.
- **Autopilot Tasks:** actionable “try this next” guidance.

---

## 6. GitHub Blueprint (Special Module)
1. Pull commits/issues.  
2. Filter noise.  
3. Summarize into technical changes, progress, milestones, blockers, overall story.  
4. Create MemoryBlock(s).  
5. Update timeline, lore, chapters, identity (skill growth), achievements.

**No clutter. No diffs. Only distilled progress.**

---

## 7. Instagram/X Blueprint
Input: caption, image content, hashtags, location, date, style/emotional tone.  
Output: meaning, narrative impact, identity effect, milestone detection, character connections.

Again—no noise, just meaning.

---

## 8. Agent Blueprint
Codex-powered agents run on intervals or triggers:
- Timeline Agent
- Identity Agent
- Continuity Agent
- Integration Agent
- Summary Agent
- GitHub Agent
- Social Ingest Agent

All agents use Codex as their brain.

---

## 9. Data Safety & Control
- Always allow user override.
- Store summaries (not raw private data).
- Provide delete abilities.
- Respect privacy boundaries.

Users control the narrative.

---

## 10. System Contract
Codex must stay lightweight, explainable, and compression-first. Never dump raw data. Prioritize meaning over volume. Serve the user and improve with every memory.

**Codex is your second brain, not your storage closet.**
