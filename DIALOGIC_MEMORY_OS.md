# Dialogic Memory OS — Architecture Document

## 🎯 **Core Reframe (LOCKED IN)**

**Lorekeeper is a dialog-driven sensemaking engine, not a document generator.**

Biographies, timelines, profiles, identity panels —  
**those are views, not sources of truth.**

**The source of truth is the conversation loop.**

---

## 📊 **The Four Simultaneous Processes**

Every chat message participates in:

### **1. Truth-Seeking (Epistemic Layer)**
The system continuously asks:
- Is this first-hand or second-hand?
- Is this belief stable or provisional?
- Does this contradict earlier claims?
- Is this an update, a correction, or a reflection?

**Nothing is assumed true just because it's said once.**

### **2. Memory Structuring (Ontology Layer)**
Chat messages are not stored raw. They are decomposed into:
- **memories** (experienced)
- **perceptions** (believed/heard)
- **reactions** (felt/responded)
- **decisions** (chosen)
- **claims** (asserted)
- **revisions** (retracted or refined)

This prevents:
- duplication
- belief ossification
- narrative drift

### **3. Contradiction & Duplication Handling**
The system:
- does not overwrite
- does not delete
- does not collapse contradictions prematurely

Instead it tracks:
- parallel beliefs
- belief lifespans
- confidence decay
- reconciliation moments

**Contradiction is treated as data, not error.**

### **4. Narrative Compilation (Presentation Layer)**
Only after sensemaking do you generate:
- biographies
- timelines
- profiles
- summaries

**These are compiled artifacts, not the memory itself.**

---

## 🏗️ **Architecture Layers**

```
Conversation (Chat)
   ↓
Interpretation (claims, beliefs, perceptions)
   ↓
Resolution (deduplication, contradiction tracking)
   ↓
Canonical Memory (structured, time-aware)
   ↓
Narrative Views (biographies, timelines, profiles)
```

**Chat is upstream of everything.**

---

## 📚 **Lorebooks: Compiled Artifacts**

### **What a Lorebook Is (Formally)**

A Lorebook is:
- a **named**
- **versioned**
- **curated**
- **query-bound**
- **compiled narrative artifact**
- generated from the living system

It is allowed to:
- be opinionated
- emphasize a theme
- omit contradictions
- choose an arc

But it must:
- declare its scope
- declare its version
- **never claim to be the whole truth**

---

## 🔒 **Key Design Rules (LOCKED IN)**

### **✅ Rule 1: Chat never edits views directly**

Chat only:
- adds evidence
- refines confidence
- introduces revisions
- triggers questions

**Views update because memory changed, not because chat "edited a bio."**

### **✅ Rule 2: Contradictions are preserved, not resolved early**

Example:
- "I hated robotics"
- "Actually I always loved building"
- "I think I hated the environment, not the work"

**All three coexist, time-bound.**

### **✅ Rule 3: Truth is negotiated, not declared**

The system may ask:
- "Do you still believe this?"
- "Was this later disproven?"
- "Does this feel accurate now?"

Never:
- "This is false"
- "You were wrong"

### **✅ Rule 4: Biographies are queries, not files**

A biography is just:
- a filtered traversal over structured memory

That's why you can generate:
- fight-only bios
- robotics-only bios
- love-life bios
- different tones, audiences, eras

**From the same corpus.**

### **✅ Rule 5: Lorebooks never modify memory**

**A Lorebook can never modify memory.**
**Only chat and engines can.**

**Lorebooks are readers, not writers.**

---

## 📖 **Core Lorebooks vs Generated Views**

### **1️⃣ Core Lorebooks (Saved, Canonical Editions)**

These are important and persist.

**Examples:**
- "The Story of My Life"
- "My Fight Career"
- "Becoming a Roboticist"
- "Love, Loss, and Growth"

**Properties:**
- manually named
- explicitly saved
- versioned
- regenerable, but not auto-overwritten
- used as: legacy artifacts, exports, future uploads

**These are books.**

### **2️⃣ Ephemeral Lorebooks (Generated Views)**

These are:
- temporary
- on-demand
- disposable

**Examples:**
- "Summarize my 2019–2021 era"
- "Give me a neutral version of my robotics arc"
- "What would a public bio look like?"

**These are queries, not books.**

---

## 🔄 **Lorebook Lifecycle**

```
Chat → Memory Graph → Sensemaking Engines
                ↓
        (User requests or saves)
                ↓
        Lorebook Compilation
                ↓
      Saved Lorebook (Versioned)
```

**If memory changes later:**
- the Lorebook stays as-is
- the system can say:
  - "This Lorebook reflects your understanding as of X"

**That's honest and powerful.**

---

## 💾 **What's Stored in a Lorebook**

Each saved Lorebook contains:

- **BiographySpec** (filters, scope, tone)
- **Chapter structure**
- **Generated prose**
- **Reference hashes to NarrativeAtoms**
- **Version metadata**
- **Memory snapshot timestamp**

That way:
- you can regenerate it later
- you can diff versions
- you can explain why it reads the way it does

---

## 🎯 **Recommended Core Lorebooks Set**

### **Primary Lorebook**
- **"The Story of My Life"**
  - long-form, evolving, versioned

### **Domain Lorebooks**
- **Fight Lorebook**
- **Robotics Lorebook**
- **Creative Lorebook**

### **Legacy Lorebook**
- **explicit**
- **posthumous**
- **truth-first**

**You don't need more than that to start.**

---

## 🏷️ **Naming & Framing**

**Calling them Lorebooks is correct because:**
- **lore ≠ objective fact**
- **lore = meaning, story, interpretation**

That aligns perfectly with:
- perceptions
- belief evolution
- multiple truths over time

**You're not writing history.**
**You're writing lore.**

---

## 🚀 **Why This Enables the "Future Upload" Vision**

Because:
- memory is structured
- beliefs are scoped
- contradictions are explicit
- voice is captured
- evolution is tracked

**A future AI doesn't just read your life —**
**it can reason with it.**

That's the difference between:
- "Here's my biography"
- "Here's how I thought, changed, and chose"

---

## ✅ **What You've Actually Built**

**You've built a Dialogic Memory OS.**

**Core properties:**
- conversational ingestion
- epistemic humility
- temporal awareness
- narrative compilation
- future portability

**This is much bigger than a journaling app.**

---

## 🎯 **Implementation Status**

### **✅ Completed:**
- NarrativeAtoms as AST nodes
- NarrativeGraph with indexes
- Biography compilation pipeline
- Version system (build flags)
- Content filtering (version-aware)
- Recommendation engine (derived)
- Core Lorebooks system
- Save-as-Core functionality
- Version tracking

### **🔄 In Progress:**
- Chat-driven truth negotiation
- Contradiction tracking
- Memory structuring from chat
- Belief evolution timeline

---

## 📐 **System Hierarchy (Locked In)**

```
┌─────────────────────────────────────┐
│  Chat (Source of Truth)             │
│  - Negotiates truth                  │
│  - Refines confidence               │
│  - Updates memory                   │
└──────────────┬──────────────────────┘
                ↓
┌─────────────────────────────────────┐
│  Memory Graph (Canonical State)     │
│  - Structured atoms                  │
│  - Contradictions tracked           │
│  - Time-aware                       │
└──────────────┬──────────────────────┘
                ↓
┌─────────────────────────────────────┐
│  Lorebooks (Compiled Artifacts)      │
│  - Read from memory                  │
│  - Never modify memory               │
│  - Versioned snapshots               │
└─────────────────────────────────────┘
```

---

## 🔒 **Hard Rules (Protects Everything)**

1. **Lorebooks can never modify memory**
2. **Only chat and engines can modify memory**
3. **Lorebooks are readers, not writers**
4. **Contradictions are data, not errors**
5. **Truth is negotiated, not declared**

---

## ✅ **Final Sanity Check**

**You're not:**
- cloning yourself ❌
- freezing identity ❌
- asserting objective truth ❌

**You are:**
- preserving perspective ✅
- allowing growth ✅
- enabling reinterpretation ✅

**This is ethically sound and technically correct.**

---

**Mental model locked in.**
**Architecture aligned.**
**Ready for the future.**
