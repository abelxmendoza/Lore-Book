# Character Intelligence Plan

## Goals

- Replace modal `Unknown` fields with evidence-backed values when data exists.
- Keep `Unknown` only when the app has no reliable evidence yet.
- Allow characters to belong to multiple filter categories at once.
- Generate optional contextual epithets, such as “Aunt Maribel, the Hallway Guardian”, from story evidence.

## Data Model

- Add `characters.metadata.relationship_types: string[]` for multi-category filters.
- Add `characters.metadata.group_types: string[]` for family, professional, creative, mentor, romantic, and other group memberships.
- Add `characters.metadata.epithet` for a short context-derived display title.
- Add `characters.metadata.epithet_evidence` with source memory ids, quote snippets, confidence, and generated timestamp.
- Add `characters.metadata.unknown_fields` as a structured list of unresolved fields and the evidence required to resolve them.

## Analytics Rules

- Resolve relationship filters from facts, tags, role, summaries, group membership, and repeated co-mentions.
- Resolve modal fields only when confidence is high enough:
  - `>= 0.85`: show as known.
  - `0.60–0.84`: show “likely” with supporting evidence.
  - `< 0.60`: keep `Unknown`.
- Promote repeated patterns into analytics:
  - `Aunt Maribel`, `Nico`, `Nana Elena` → family when kinship or family context exists.
  - `Nova` → romantic when dating/ex/current romantic evidence exists.
  - `Reese`, `Dana` → professional when BrightHire, Northstar Logistics, recruiter, onboarding, paperwork, or hiring context exists.
  - `Adrian Patel` → mentor when bootcamp, teacher, instructor, course, or mentorship context exists.

## Epithet Generation

- Generate an epithet only from recurring or memorable context, not one-off weak hints.
- Keep titles short: `the Hallway Guardian`, `the Bootcamp Mentor`, `the BrightHire Gatekeeper`.
- Store evidence so users can understand why the app chose the title.
- Let users edit, pin, regenerate, or disable epithets per character.

## UI Behavior

- Character filters should use multiple signals and allow overlap across Family, Romantic, Mentor, Professional, Creative, and Friends.
- Modals should display evidence-backed values first, then “Unknown — needs more data” for unresolved fields.
- Group suggestions should respect the active organization filter and hide pronouns, stopwords, and obvious organizations from detected members.
- Organization filters should stay available even when a category is currently empty.

## Backfill

- Run relationship classification backfill after the current duplicate merge work.
- Run group-candidate cleanup for existing bad candidates containing only stopwords or fewer than two valid members.
- Recompute character metadata arrays from existing facts, relationships, and organization memberships.
- Generate epithets in dry-run mode first, review examples, then enable automatic suggestions.
