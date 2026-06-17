# Biography Experience

Date: 2026-06-15

Purpose: define the complete user-facing biography workflow for LoreBook. This assumes the Biography Engine, Epiphany Engine, Life Graph ontology, revealed-preference engine, and trust layer exist. It focuses on experience, not redesign.

## Thesis

Biography should not feel like an AI judging the user. It should feel like a careful biographer helping the user see, verify, shape, and preserve their life.

The product must help the user:

- discover themselves
- review their life
- see patterns
- see contradictions
- see growth
- choose what their life story means
- generate source-backed prose

without feeling creepy, diagnostic, or robotic.

## The Complete Workflow

### 1. Invitation, Not Declaration

Bad:

> "Your life is about abandonment."

Good:

> "I found a possible thread across several years: building things seems to become most important when you are trying to reclaim agency. Want to review the evidence?"

Biography starts with invitations:

- "Review your year"
- "Draft a chapter"
- "Explore a recurring pattern"
- "Look at who shaped this period"
- "See what changed"

The user enters willingly.

### 2. Evidence Review

Before prose, the user sees the source set:

- episodes
- people
- places
- projects
- decisions
- relationship arcs
- themes
- open gaps
- contradictions

This stage answers: "What is LoreBook using?"

Actions:

- include
- exclude
- correct
- mark sensitive
- add missing context
- split mixed event
- merge duplicate scene

### 3. Life Slice Selection

The user chooses the scope:

- a year
- a chapter
- a person
- a project
- a relationship
- a theme
- a turning point
- a whole life period

The engine proposes scopes from chapters/arcs, but the user can override.

### 4. Thesis Candidates

Biography is not a list. It needs a point of view.

LoreBook proposes several evidenced theses:

- "A year of building autonomy"
- "A family responsibility chapter"
- "The career rebuild"
- "Learning which relationships to continue"
- "The birth of LoreBook as identity work"

Each thesis shows:

- supporting arcs
- strongest scenes
- contradictions
- confidence
- what would be omitted

The user chooses, edits, or rejects. This is the most important human-in-the-loop moment.

### 5. Chapter Outline

The system builds a scaffold:

- opening scene
- causal spine
- major people
- turning points
- conflicts
- motifs
- inner change
- unresolved questions
- closing state

The outline should be editable before any long prose is generated.

### 6. Scene Cards

Each chapter is grounded in a small number of scene cards.

Scene card fields:

- what happened
- who was there
- where
- what was said or felt, if recorded
- why it mattered
- evidence
- confidence
- sensitivity

Biography quality depends on selection. Most memories should be omitted.

### 7. Tone And Voice

The user chooses a register:

- plain factual
- literary memoir
- intimate first-person
- third-person biographer
- legacy letter
- evidence-only
- warm but restrained

Voice should never override truth. Missing details remain missing.

### 8. Draft Generation

Generate chapter by chapter, not entire-life blob.

Each paragraph should be traceable:

- source markers
- confidence
- interpretation labels
- unresolved gaps

The default view is readable prose; evidence appears on demand.

### 9. Review And Correction

User feedback types:

- wrong fact
- wrong tone
- too much inference
- missed meaning
- too sensitive
- wrong person
- wrong chronology
- keep but mark uncertain

Corrections update the graph, not only the draft.

### 10. Living Biography

The biography is not final unless exported. It evolves:

- new episodes update chapter candidates
- contradictions change interpretation
- relationships evolve
- projects end or restart
- values shift
- old chapters become clearer in hindsight

Show a "what changed since last draft" diff.

## How Users Discover Themselves

### Pattern Review

Show recurring patterns as questions:

- "This happened four times across different relationships. Does it feel connected?"
- "Family responsibility appears in many decisions. Is that how you would name it?"

### Contradiction Mirror

Show stated vs revealed gaps gently:

- "You often describe independence as important, and your choices support that."
- "You say rest matters, but there are few episodes where rest wins over work."

### Growth View

Show change:

- old pattern
- trigger
- repeated response
- first break in pattern
- current behavior

This is one of the most powerful biography experiences because it makes growth visible.

### Relationship Review

For a person:

- how they entered
- role changes
- closeness changes
- conflicts
- repairs
- influence
- current state

### Project Review

For a project:

- origin
- decisions
- collaborators
- setbacks
- breakthroughs
- what it revealed about the user

## Avoiding Creepiness

Rules:

- Phrase insights as observations, not verdicts.
- Do not diagnose.
- Do not assign motives without evidence.
- Do not surprise the user with sensitive interpretations in casual chat.
- Ask before using private/sensitive material in biography.
- Show evidence before strong interpretation.
- Let the user reject a thesis permanently.
- Separate facts from interpretations visually.
- Use "might" for low-confidence patterns.
- Preserve user authority over meaning.

## Avoiding Robotic Output

Robotic biography fails when it is:

- event list
- generic lesson
- over-summarized
- therapist-like
- full of labels
- missing scenes
- too confident
- emotionally flat

Fixes:

- Start with scenes.
- Use concrete details.
- Keep the user's own language.
- Include unresolvedness where true.
- Use selective omission.
- Write from a chosen thesis.
- Let evidence constrain prose.

## Signature Experiences

### "Show Me My Year"

Output:

- top chapters
- major people
- turning points
- repeated themes
- unresolved loops
- strongest scenes
- source-backed draft

### "Who Changed Me?"

Output:

- ranked people by influence
- evidence scenes
- positive/negative/mixed influence
- chapters they shaped

### "What Pattern Am I Repeating?"

Output:

- detected pattern
- examples
- confidence
- what changed recently
- confirm/refute/refine actions

### "Write This Chapter"

Output:

- thesis
- outline
- selected scenes
- draft
- evidence drawer
- correction path

### "What Did I Outgrow?"

Output:

- old pattern
- evidence
- first break
- current status
- biography paragraph

## Success Metrics

- Chapter completion rate.
- Evidence inspection rate.
- Correction rate that improves trust.
- User-confirmed thesis rate.
- Biography export rate.
- "This feels true" rating.
- Sensitive-material rejection rate.
- Growth insight confirmations.
- Return to biography surface.

## Non-Goals

- Do not auto-generate a complete life story without user review.
- Do not make the system sound like a therapist.
- Do not present speculative psychology as fact.
- Do not optimize for volume of prose.
- Do not make biography irreversible.

## Product Principle

The best biography experience is co-authored: LoreBook brings memory, structure, pattern, and evidence; the user brings meaning, consent, and final authority.
