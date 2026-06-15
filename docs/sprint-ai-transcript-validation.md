# Sprint AI — Transcript Replay Validation

## Scenarios

### 1. Abuela testing session
**Query:** "Did you save Abuela?"
**Before:** Generic ack or "tell me now"
**After:** Memory Formation report — Character ✓/✗, Relationship, Memories, Location (Abuela's House), Evidence count

### 2. Costco session
**Query:** "What did I say earlier?"
**Before:** Thin record / therapist redirect
**After:** Thread recap with People (Abuela), Places (Costco), Events, **Meaning** ("highlight was Abuela still alive")

### 3. Tío Juan session
**Query:** "What do you know about my family?"
**Before:** Flat PEOPLE list
**After:** Family structure tree (Abuela → Tío Juan, Tía Lourdes → You) + grouped roster

### 4. Ashley De La Cruz session
**Query:** "What do you know about Ashley?"
**Before:** Empty or generic
**After:** Entity profile with Facts + Meaning from thread, memory count even if low

### 5. Sol session
**Query:** "Who are the characters in my story?"
**Before:** PEOPLE (18) bullet list
**After:** Grouped roster — Romantic: Sol, Ashley De La Cruz; Family: Abuela, Tío Juan…

### 6. Character roster session
**Query:** "Do you remember?"
**Before:** Reflective question
**After:** Thread-first proof — people, places, events, projects from current conversation

## Failure recovery
**Query:** "You forgot" / "aww man"
**After:** Diagnostic dump — This thread, Character memory (grouped), Relationship memory (tree), Structured layers

## Verified claims
Experience ingestion no longer says "I've captured/saved" — uses processing language until formation status confirms storage.
