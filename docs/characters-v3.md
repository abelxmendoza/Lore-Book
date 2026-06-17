# Character Pages V3

Date: 2026-06-15

Purpose: define the best character system for LoreBook after the life graph succeeds. Character Pages V3 are living people models, not database profiles.

## Thesis

A person in LoreBook is not a row named "Jerry" or "Tía Grace." A person is a changing presence in the user's life: memories, scenes, relationship dynamics, influence, conflicts, roles, turning points, and unresolved questions.

Character Pages V3 should answer:

1. Who are they?
2. What is their relationship to the user?
3. What happened with them?
4. How did the relationship change?
5. Why do they matter in the user's story?
6. What is uncertain or unresolved?

## Page Structure

### 1. Living Summary

Short, evidence-backed overview:

- Relationship to user.
- Current role.
- Importance and confidence.
- Last meaningful interaction.
- Primary story arcs.
- Source density.

Example:

> Jerry appears as a friend and early LoreBook collaborator, tied to family gathering scenes and technical conversations around the project's early buildout.

### 2. Relationship Timeline

Chronological relationship history:

- First seen.
- Important scenes.
- Changes in closeness.
- Conflicts or distance.
- Repairs.
- Last seen.
- Current state.

This should not be a flat event list. It should show the relationship's movement.

### 3. Major Scenes

Vivid, source-backed episodes involving the person:

- Tía Grace's house.
- Club Metro.
- Costco with Abuela.
- Kelly onboarding.
- Amazon hiring process.

Each scene card:

- Summary.
- Participants.
- Location.
- Activities.
- Emotional context.
- Meaning.
- Evidence count.
- Source links.

### 4. Influence

How this person shaped the user:

- Decisions influenced.
- Projects touched.
- Values or fears revealed.
- Themes they belong to.
- Chapters where they appear.
- Whether influence is stated, revealed, or inferred.

Influence must be evidenced, not vibe-based.

### 5. Evolution

How the person model changed:

- New facts learned.
- Corrected facts.
- Relationship role changes.
- Importance changes.
- Contradictions resolved.
- Deprecated assumptions.

This is the difference between a profile and a living model.

### 6. Conflicts And Contradictions

Show:

- Conflicting facts.
- Ambiguous names.
- Potential duplicates.
- Unresolved relationship states.
- Sensitive or disputed claims.

Example:

> Potential identity conflict: Juan appears as both family context and scene/community context. Do not merge automatically.

### 7. Open Loops

Questions the system needs answered:

- Are these two people the same?
- What date did this happen?
- Is this relationship current or ended?
- Should this person be private?
- Which scene is the source of this fact?

Open loops are a trust feature. They show the system knows what it does not know.

## Core Page Modules

| Module | User value | Notes |
|---|---|---|
| Identity | Stable person summary | Must distinguish fact vs inference |
| Relationship | How they relate to user | Kinship, friendship, romantic, professional, community |
| Timeline | What happened over time | Events and relationship changes |
| Scenes | Memory texture | Reconstructable episodes |
| Influence | Why they matter | Evidence-backed impact |
| Role in arcs | Narrative function | Mentor, ally, foil, love interest, antagonist by arc, not globally |
| Preferences | How user feels/acts around them | Requires sensitivity |
| Conflicts | Trust maintenance | Contradictions and duplicate candidates |
| Sources | Provenance | Every claim inspectable |
| Actions | Correction and curation | Merge, split, correct, hide, biography |

## Character Creation V3

Creation is not "make a card." It is an entity lifecycle:

1. Mention detected.
2. Type classified.
3. Candidate person resolved.
4. Evidence linked.
5. Character page created or existing page updated.
6. Confidence assigned.
7. User can verify or correct.

The page should show creation state:

- Entity exists.
- Character exists.
- UI card exists.
- Ingestion succeeded.
- Evidence linked.
- Creation failed or deferred reason.

## Duplicate And Ambiguous People

Never merge automatically when context disagrees.

Merge suggestions should appear when:

- Names overlap.
- Aliases match.
- Same relationship context.
- Same co-occurring people/places.
- Same time period.
- No conflicting type or role.

Do not merge when:

- Same first name, different life domain.
- Kinship term differs.
- One appears in family, another in scene/community.
- User has not confirmed.
- Evidence is sparse.

## Relationship Significance

Importance should be explainable:

- Memory count.
- Recency.
- Emotional intensity.
- Relationship centrality.
- Number of chapters/arcs.
- User corrections or pins.
- Influence on decisions.

The page should say why someone is important, not just assign a score.

## Character Page Actions

- Ask about this person.
- Reconstruct a scene.
- Show timeline.
- Show all sources.
- Correct fact.
- Merge/split.
- Mark private.
- Add to biography.
- Compare relationship over time.
- Ask "why do they matter?"

## Best-In-Class Character Moments

- "Jerry has a page, but only two linked memories. Want to review where he was mentioned?"
- "Ashley is tied to the Club Metro night and a short-lived romantic arc."
- "Tía Grace is a person, but the important object is the house scene. Open scene?"
- "Tío Juan's importance comes from household care and recurring family responsibility."
- "This Juan may not be Tío Juan. The evidence points to scene/community context."

## Success Metrics

- Character recall success rate.
- Percentage of characters with linked evidence.
- Orphan character count.
- Merge suggestion precision.
- User-confirmed corrections per character.
- Character page revisits.
- "Who is X?" answer satisfaction.
- Relationship story coverage.

## Non-Goals

- Do not make people feel like CRM contacts.
- Do not diagnose people.
- Do not assign moral labels as facts.
- Do not auto-merge identity conflicts.
- Do not surface sensitive people casually.

## Product Principle

A Character Page should feel like LoreBook understands a living relationship, not like it stored a name.
