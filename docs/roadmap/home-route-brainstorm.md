# Home Route / Landing Page Rethink

**Date:** 2026-05-27  
**Status:** Brainstorm only — no code changes  
**Context:** Current landing was built when the product identity was "governed autobiographical cognition infrastructure." That identity has been retired. The new identity is: a system that gradually remembers your life.

---

## What's Wrong With the Current Landing

**Immediate problems:**

1. **Brand name inconsistency** — page says "LoreBook" everywhere. Product is Lorekeeper.

2. **Fake social proof** — three testimonials from "Early User," "Beta Tester," "Writer & Creator." Any visitor who notices these are synthetic loses trust immediately and doesn't come back.

3. **Competitive framing against ChatGPT** — five sections explaining why Lorekeeper is better than ChatGPT/Grok. This frames Lorekeeper as a chatbot that wants to be something else. It also invites the comparison we lose on (chatting, general intelligence). Nobody chooses a product because of a table showing it's better than another product.

4. **"Notion for your soul" / "The Jarvis of your life"** — borrowed metaphors from other products. Neither one is correct. Notion is a workspace tool. Jarvis is a fictional AI assistant. Lorekeeper is neither.

5. **Feature grid (6 cards) is premature** — lists features that may not be reliably working yet (9-layer timeline, multiple AI personas). If a visitor signs up and the product doesn't deliver these immediately, it feels broken.

6. **$15/month pricing on a pre-validation product** — locks in expectations before the core experience is proven.

7. **"Continuity Intelligence," "9-Layer Timeline," "Mythos → MicroActions"** — all architecture terminology. No user will know what "9-layer timeline" means or care.

---

## What the First Impression Should Feel Like

**The 5-second test:** A new visitor should immediately feel:

> "This thing actually knows me over time. It's not starting fresh every conversation."

That's it. Everything else is secondary.

The current landing tries to say: "this is a technically sophisticated system with many powerful features." That is not a feeling — it's a list.

The new landing should say one thing, deeply. The right feeling is somewhere between:
- "This is a trusted confidant that doesn't forget"
- "Someone is keeping track of my story"
- "This is different from every other chat AI I've used"

**What to avoid:** Any language that sounds like product marketing ("powerful," "revolutionary," "next-generation"), any architecture jargon, any comparison to other products.

---

## Hero Section Direction Options

### Option A — "The long memory"

**Headline:** It remembers.  
**Subhead:** Every conversation adds to a record of your life. The longer you use it, the more it knows — without being told twice.  
**CTA:** Start a conversation

**Visual:** A single conversation thread where entity chips have accumulated over time. Before/after framing: first conversation (empty), tenth conversation (chips for "Mom," "Portland," "job at Anthropic"). The UI itself demonstrates the product.

**Tone:** Quiet, confident, minimal. No features list.

---

### Option B — "Day one vs. day thirty"

**Headline:** It gets better the longer you use it.  
**Subhead:** Most AI forgets everything between conversations. Lorekeeper doesn't. It accumulates what matters — people, recurring situations, decisions — and carries them forward.  
**CTA:** Try it

**Visual:** Split screen or timeline — same question asked on day 1 ("who is my sister?") and day 30 (assistant responds with context about her without being told).

**Tone:** Direct product demonstration. Shows the delta.

---

### Option C — "Your lore"

**Headline:** Your lore, building.  
**Subhead:** Share something. Come back tomorrow. Mention it again. Over time, Lorekeeper builds a record — sparse, honest, and yours.  
**CTA:** Begin

**Visual:** Thread list with entity chips. Feels like a living document, not a chat window.

**Tone:** Poetic, unhurried. Appeals to journalers and reflective users.

---

### Option D — "No introduction required"

**Headline:** You've already told it once.  
**Subhead:** Lorekeeper carries context across every conversation. Your name for your mom, the job you left, the city you're thinking about moving to — once shared, always known.  
**CTA:** Start your record

**Visual:** A brief animated example: user mentions "Abuela" in thread 1. In thread 4, assistant refers to Abuela by name without being told again. Shows the loop closing.

**Tone:** Demonstrates specificity. The headline is the product promise in the most concrete terms possible.

---

## Visual Language

**What's working about the current design:**
- Dark background, purple accent feels intentional and distinct
- Typography scale is clean
- The card components look polished

**What should change:**

1. **Lead with the UI, not a hero illustration** — The actual product (thread list, entity chips, mode attribution badge) is more compelling than any marketing visual. Show a screenshot or interactive demo of a real thread with accumulated context.

2. **Entity chips as the visual proof point** — Small, subtle, but legible tags like "Mom · Portland · Anthropic" next to a thread title communicate the whole product in one glance. Use them prominently.

3. **Reduce purple saturation in copy areas** — The gradient from the current design works well as background but makes body text harder to scan. Consider pulling back to near-black in content sections.

4. **No stock-photo portraits or avatars** — Currently the founder photo is there; that's fine. But no generic "person journaling" imagery. The product is text and data — represent it as such.

---

## Demo Experience

The best first experience for a new visitor is to use the product, not read about it.

**Option 1 — Embedded demo conversation**

A live chat interface on the landing page that lets visitors type and see responses, with a persistent demo user's record preloaded. When the visitor says "what do you know about me?" the system responds with the demo persona's record. This shows continuity in action immediately.

**Risk:** Demo state could confuse visitors about what's "theirs" vs. the demo persona. Needs clear framing.

**Option 2 — Animated walkthrough**

A scripted 30-second walkthrough showing:
- Conversation 1: user mentions "Abuela," chips appear
- Conversation 4: user starts new thread, says "how's my family doing?" — system responds with context about Abuela

**Risk:** Looks like marketing, not product. If the visitor signs up and experience is different, it breaks trust.

**Option 3 — "Your first conversation starts here"**

No demo at all. The CTA goes directly to a chat interface. The landing is short, makes one promise, and gets out of the way.

**Risk:** Visitors who need more context before committing won't convert.

**Recommendation:** Option 3 for the immediate redesign. Add Option 1 only once the demo experience can be backed by a real preloaded record. Option 2 only if a real screen recording is used (not animations).

---

## Homepage Structure

### Current structure (too long):

1. Hero
2. Feature grid (6 cards)
3. Fake social proof (3 testimonials)
4. "Not just another chatbot" comparison (5 sections)
5. CTA
6. Founder section

### Proposed structure:

1. **Hero** — one headline, one subhead, one CTA. Show the product UI.
2. **How it works** — three short paragraphs or steps: you share → it extracts → future conversations carry it forward
3. **What accumulates** — brief list of what gets remembered (people, events, recurring situations), with one or two concrete examples
4. **The honest limits** — a short section about what Lorekeeper doesn't do (doesn't fabricate, doesn't infer beyond what you share). This builds trust more than testimonials do.
5. **Start** — CTA, stripped down

**What to remove entirely:**
- All fake testimonials
- All comparisons to ChatGPT/Grok
- "Notion for your soul," "Jarvis of your life"
- The feature grid with unvalidated features (9-layer timeline, AI companions, cost optimization)
- $15/month pricing (until core experience is proven and stable)

---

## Core Product Story Options

Three different ways to tell the Lorekeeper story in one paragraph:

---

**Story A — The long view:**
> "Most AI tools reset between conversations. Lorekeeper doesn't. Every conversation adds to a record — the people you mention, the situations you return to, the decisions you make. Over weeks and months, it accumulates a picture of your life that no single conversation could give it. The longer you use it, the more accurately it reflects who you actually are."

---

**Story B — The concrete promise:**
> "You mentioned your sister once, weeks ago. When you mention her again today, Lorekeeper already knows who she is. That's the only thing this product does — but it does it honestly, across every conversation, for as long as you keep using it."

---

**Story C — The contrast:**
> "Other AI starts from zero every time. Lorekeeper starts from where you left off. Share your life in fragments, in whatever order, across however many conversations. It quietly accumulates what matters and carries it forward."

---

## What Not to Do

- Don't redesign the landing until the core continuity experience is provably working. A beautiful landing promising something broken is worse than an ugly landing that undersells something real.
- Don't add a pricing section until there's a validated reason someone would pay.
- Don't launch a testimonials section with anything except real quotes from real users.
- Don't use "LoreBook" — the product is called Lorekeeper.
- Don't mention the 9-layer hierarchy, epistemic lattice, or any backend architecture on a consumer-facing page.
- Don't promise things that are still in the unvalidated column of runtime-truth-validation.md.

---

## Suggested Next Step

Before redesigning the landing:

1. Run the 6 validation tests in `docs/runtime/runtime-truth-validation.md`
2. Confirm that basic continuity (entity chip → cross-thread retrieval) works end-to-end
3. Then build the landing around what was actually validated — not what was architected

The landing should be a promise the product can keep, not a preview of what it might eventually do.
