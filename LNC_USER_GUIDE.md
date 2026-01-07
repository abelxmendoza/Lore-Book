# LoreKeeper Narrative Compiler (LNC) - User Guide

## What is the LoreKeeper Narrative Compiler?

The **LoreKeeper Narrative Compiler (LNC)** is a compiler-inspired system that ensures your journal entries are processed with **epistemic integrity**—meaning it distinguishes between what you experienced, what you feel, what you believe, and what is fact. This prevents hallucinations, ensures accuracy, and makes your memories more reliable.

**Think of it like a compiler for your life story**: Just as a programming language compiler ensures code is valid and optimized, the LNC ensures your memories are classified correctly and processed efficiently.

## Why Does This Matter?

Traditional journaling systems treat all entries the same way. But your journal contains different types of knowledge:
- **EXPERIENCE**: "I went to the park yesterday"
- **FEELING**: "I felt anxious about the meeting"
- **BELIEF**: "I think Sarah is avoiding me"
- **FACT**: "The meeting was scheduled for 3pm"
- **DECISION**: "I decided to quit my job"
- **QUESTION**: "What if I moved to a new city?"

The LNC automatically classifies each entry and ensures:
- ✅ **Beliefs never become facts** - Your thoughts and opinions stay as beliefs
- ✅ **Feelings never become claims** - Emotions are marked as subjective
- ✅ **Low-confidence facts are downgraded** - Unreliable information is marked appropriately
- ✅ **Pattern detection only uses experiences** - Insights are based on what actually happened
- ✅ **Memory recall prioritizes facts** - When you ask questions, you get reliable answers

## How It Works (Behind the Scenes)

### Phase 1: Entry IR + Incremental Compilation

When you write a journal entry:

1. **Compilation to IR**: Your entry is compiled into an **Entry Intermediate Representation (IR)**:
   - The system classifies it (EXPERIENCE, FEELING, BELIEF, etc.)
   - Extracts entities (people, places, things)
   - Extracts emotions and themes
   - Assigns a confidence score
   - Determines the source of certainty (direct experience, inference, hearsay, etc.)

2. **Dependency Graph**: The system tracks relationships:
   - Which entries mention the same people
   - Which entries are related to each other
   - Which entities appear in which entries

3. **Incremental Compilation**: When something changes:
   - Only affected entries are recompiled
   - No unnecessary recomputation
   - Fast and efficient updates

### Phase 2: Entity Symbol Table + Epistemic Type Checking

When entities (people, places, things) are mentioned:

1. **Symbol Resolution**: The system resolves entity names:
   - "Sarah" → Resolves to the same person every time
   - "Work" → Resolves to the same location consistently
   - Uses scope chains (like variable lookup in programming)

2. **Type Checking**: The system validates entity usage:
   - If you say "Sarah is my friend" in a FEELING entry → Marked as subjective
   - If you say "Sarah works at Google" in a BELIEF entry → Marked as belief, not fact
   - If you say "The meeting was at 3pm" in a FACT entry → Requires high confidence

3. **Automatic Downgrading**: If a FACT entry has low confidence:
   - Automatically downgraded to BELIEF
   - Prevents unreliable information from being treated as fact

## What You Experience

As a user, you **never see the compiler directly**. Instead, you experience:

### ✅ Fewer Wrong Memories

- When you ask "Who did I meet last week?", you get accurate answers
- Beliefs and feelings are clearly distinguished from facts
- Low-confidence information is marked appropriately

### ✅ Better Disambiguation

- "Sarah" always refers to the same person
- "Work" always refers to the same location
- No confusion between different people with the same name

### ✅ Cleaner Timelines

- Only valid experiences are used for pattern detection
- Beliefs and questions don't pollute your timeline
- Your story is more accurate and coherent

### ✅ Honest Uncertainty

- When the system isn't sure, it tells you
- Low-confidence entries are marked appropriately
- You can see the reliability of your memories

## Examples

### Example 1: Belief vs Fact

**You write:**
> "I think Sarah is avoiding me. She didn't respond to my text."

**LNC Processing:**
- Classifies as **BELIEF** (not fact)
- Marks "Sarah" as referenced in belief context
- When you later ask "Is Sarah avoiding me?", the system responds: "You believe Sarah is avoiding you, but this is not a confirmed fact."

### Example 2: Feeling vs Experience

**You write:**
> "I felt anxious about the presentation. I think I did well though."

**LNC Processing:**
- Classifies as **FEELING** (anxiety is a feeling)
- Marks "presentation" as referenced in subjective context
- The feeling is preserved, but not treated as a factual claim about the presentation

### Example 3: Low Confidence Fact

**You write:**
> "I heard from John that the meeting was cancelled. I'm not sure if that's true."

**LNC Processing:**
- Classifies as **BELIEF** (hearsay, not direct experience)
- Low confidence → Marked as belief, not fact
- When you ask "Was the meeting cancelled?", the system responds: "You heard it was cancelled, but this is unverified."

### Example 4: Pattern Detection

**You write multiple entries:**
- "I went to the gym today" (EXPERIENCE)
- "I think I should exercise more" (BELIEF)
- "I wonder if exercise helps with stress" (QUESTION)

**LNC Processing:**
- Pattern detection only uses the **EXPERIENCE** entry
- Beliefs and questions are excluded from pattern analysis
- Your patterns are based on what actually happened, not what you think or wonder

## Safety Guarantees

The LNC provides these guarantees:

1. **Beliefs Never Become Facts**
   - Your thoughts and opinions stay as beliefs
   - They're never promoted to facts automatically

2. **Feelings Never Become Claims**
   - Emotions are marked as subjective
   - They don't become factual assertions

3. **Low Confidence Facts Are Downgraded**
   - Unreliable information is automatically downgraded
   - You see the actual confidence level

4. **Pattern Detection Only Uses Experiences**
   - Insights are based on what actually happened
   - Beliefs and questions don't pollute your patterns

5. **Memory Recall Prioritizes Facts**
   - When you ask questions, you get reliable answers
   - High-confidence facts are prioritized

## Technical Details (For Developers)

### Entry IR Structure

```typescript
EntryIR {
  id: UUID
  knowledge_type: EXPERIENCE | FEELING | BELIEF | FACT | DECISION | QUESTION
  content: string
  entities: EntityRef[]
  emotions: EmotionSignal[]
  themes: ThemeSignal[]
  confidence: number (0.0 - 1.0)
  certainty_source: DIRECT_EXPERIENCE | INFERENCE | HEARSAY | ...
  narrative_links: { previous_entry_id?, related_entry_ids? }
  compiler_flags: { is_dirty, is_deprecated, last_compiled_at, compilation_version }
}
```

### Symbol Resolution

- **Scopes**: GLOBAL, ERA, EVENT, THREAD
- **Resolution**: Walks up scope chain (like variable lookup)
- **Deterministic**: Same name always resolves to same symbol

### Type Checking Rules

- **EXPERIENCE**: ✅ Can reference any entity
- **FEELING**: ✅ Entities allowed, marked as subjective
- **BELIEF**: ✅ Entities allowed, restricted (never promoted to fact)
- **FACT**: ⚠️ Requires confidence ≥ 0.6, else downgraded to BELIEF
- **QUESTION**: ✅ Query-only, no assertions
- **DECISION**: ✅ Entities used as context, not truth

## FAQ

**Q: Do I need to do anything special?**  
A: No! The LNC works automatically. Just write your journal entries normally.

**Q: Can I see the IR or symbol table?**  
A: No, these are internal representations. You only see the benefits: more accurate memories, better disambiguation, cleaner timelines.

**Q: What if I want to correct something?**  
A: Just edit your entry. The LNC will automatically recompile it and update affected entries.

**Q: Does this slow down my journaling?**  
A: No! Incremental compilation means only affected entries are reprocessed. It's fast and efficient.

**Q: What if I disagree with the classification?**  
A: The system learns from your corrections. If you consistently mark something differently, it adapts.

## Summary

The LoreKeeper Narrative Compiler ensures your memories are:
- ✅ **Accurate**: Beliefs stay as beliefs, facts stay as facts
- ✅ **Reliable**: Low-confidence information is marked appropriately
- ✅ **Efficient**: Only affected entries are reprocessed
- ✅ **Deterministic**: Same names always resolve to same entities
- ✅ **Safe**: Epistemic boundaries are strictly enforced

You never see the compiler, but you experience its benefits: fewer wrong memories, better disambiguation, cleaner timelines, and honest uncertainty.

---

*The LNC is inspired by programming language compilers, adapted for human narrative. Just as a compiler ensures code is valid and optimized, the LNC ensures your memories are classified correctly and processed efficiently.*

