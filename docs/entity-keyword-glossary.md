# Entity Keyword Glossary & Context-Inference Reference

Status: consolidated reference for entity detection, classification, inference, and stage-name disambiguation. Gathers every keyword lexicon/filter currently in the codebase so detection can be improved from one place.

Related: [classification-audit.md](classification-audit.md), [dynamic-classification-model.md](dynamic-classification-model.md).

## 1. Why this exists — the stage-name problem

Kinship words inside a **stage name / handle** are NOT kin:
- `Goth Tio` — "tio" is a trailing suffix after an aesthetic word → **not** an uncle.
- `Oscuri.dad` — handle shape (has a `.`) → **not** a father.
- `Mom Jeans` — "mom" leads but the whole is a brand/handle.

vs. real kin, which is **title-leading**:
- `Tío Juan`, `Abuela`, `Step Dad Ben`, `Tía Grace`.

**Rule (implemented in `familyTreeService.inferLeadingKinship`):** infer kinship from a name only when the kinship word is the **first token** (after optional `step`/`grand`/`great`/`half` and a possessive), and the name contains no handle punctuation (`.`, `@`, digits). Otherwise leave the entity generic and require corroborating **context** (an actual family edge, or "my uncle/tío" near the mention). An explicit relation or a user correction in conversation always overrides the name heuristic.

## 2. Keyword lexicons (current, by domain)

### Kinship titles (`kinshipGlossary.ts`, `familyTreeService.KINSHIP_TERMS`)
`abuela, abuelita, abuelo, abuelito, grandma, grandmother, nana, nonna, granny, grandpa, grandfather, nono` · `mom, mother, mamá, mama, mommy, dad, father, papá, papa, daddy` · `tía, tia, aunt, auntie, tío, tio, uncle` · `primo, prima, cousin` · `hermano, hermana, brother, sister, sibling` · modifiers: `step, grand, great, half`.

### Honorifics that imply a Person (`entityClassifier.HONORIFIC_RE`)
`tío/tía/uncle/aunt/auntie, mom/mother/mama/dad/father/papa, step mom/step dad, grandma/grandpa/abuela/abuelo, brother/sister, mr/mrs/ms/miss/dr/sir, cousin/primo/prima, coach, pastor`.

### Apps (`entityClassifier.APPS`)
`find my, venmo, cash app, zelle, paypal, instagram, snapchat, tiktok, whatsapp, facetime, imessage, messenger, spotify, youtube, discord, slack, zoom, gmail, maps, google maps, uber eats, doordash app, notion, figma, github, chatgpt, lorebook`.

### Food/Drink (`FOOD_DRINKS`)
`high noon, white claw, truly, modelo, corona, budweiser, heineken, red bull, monster, celsius, coffee, matcha, boba, beer, wine`.

### Products (`PRODUCTS`)
`amazon ring, ring, nest, alexa, echo, iphone, ipad, airpods, macbook, playstation, xbox, nintendo switch, kindle, fire tv, roku, tesla`.

### Brands / Companies (`BRANDS`, `COMPANIES`)
`nike, adidas, vans, supreme, patagonia, north face` · plus company lexicon (Amazon, etc.).

### Places / Venues (`PLACES`, `VENUES`)
- **Geographic suffix** (`GEO_SUFFIX`): `valley, hills, heights, springs, beach, city, lake, mountains, canyon, mesa, grove, ridge, falls, gardens, county, harbor, bay, island, park`.
- **Venue suffix** (`VENUE_SUFFIX`): `house, home, apartment, gym, studio, cafe, coffee, restaurant, bar, club, school, hospital, mall, store, shop, market, station, office, library, museum, stadium, arena, university, college, campus, building, tower, center, church, temple, airport`.

### Media / Skills (`MEDIA`, `SKILLS`, `BANDS_AND_ORGS`)
media franchises, practiced skills, and known bands/orgs lexicons.

### Relationship signals (`CharacterBook.relationshipSignalsFor`)
- **family**: `my/his/her grandmother/mom/dad/cousin/aunt/uncle/abuela/tío/tía/family`
- **romantic**: `dated, dating, romantic, girlfriend, boyfriend, situationship, crush, ex, hooked up, partner, wife, husband`
- **mentor**: `mentor, teacher, instructor, bootcamp, coach, professor, advisor, taught me, guided me`
- **professional**: `agency, recruiter, onboarding, hiring, colleague, coworker, job, career, client, manager, boss`
- **creative**: `bandmate, collaborator, co-founder, artist, music, producer, dj, studio, perform`
- **friend**: `friend, ally, buddy, roommate, homie`
- **rival/adversary** (new): `enemy, rival, rivalry, adversary, nemesis, opponent, conflict, feud, beef, fell out, fallout, can't stand, toxic, estranged, cut off, ex-friend, drama, tension, dislike, bad blood, backstab` — plus normalization of detector types `enemy_of / rival_of / ex_friend_of → rival`.

### Relationship type enum (`entityRelationshipDetector`)
positive: `friend_of, best_friend_of, close_friend_of, childhood_friend_of` · adversarial: `enemy_of, rival_of, ex_friend_of` · plus mentor/colleague/family edges. (LLM prompt now explicitly instructs detecting both bonds and conflicts.)

### Conflict subsystem (`services/conflict/`)
full extractor/classifier/scorer/resolver pipeline keyed on conflict cues; wired to `/api/conflicts` + engine registry.

## 3. Context-inference cues (beyond name keywords)

To classify/infer when the name alone is ambiguous (the stage-name case), use **conversation context**:
- **Co-occurrence with scene/location**: `Goth Tio` appears with `Club Metro` / `Los Goths` / Gothicumbia → a **nightlife/scene persona**, not family. Weight location + group context.
- **Multiple people together in a story**: people named together at the same event/place share a **scope** (the same crew, family gathering, work team) — infer group membership and relationship kind from the shared setting.
- **Explicit relationship phrases**: `my uncle`, `my tío`, `my coworker`, `we fell out` near the mention are stronger than the display name.
- **Handle markers**: `.`, `@`, digits, lowercase concatenation → treat as stage name/handle; do not infer kin/role from it.
- **Possessive + role**: `my X` where X is a kinship/role word corroborates the role.

Precedence (highest → lowest): explicit user correction → relationship edge/metadata → context phrase ("my uncle") → title-leading name → trailing keyword (ignored for kin).

## 4. Duplicate / similar-name / context-link findings (founder, live)

| Check | Result |
| --- | --- |
| Exact-duplicate characters | **0** (clean) |
| Similar (shared first token) | `Tía Lourdes…` vs `Tía Grace` — **false positive** (shared title token, different people). Dedup must NOT use a kinship title as the shared-token signal. |
| **Cross-store collisions (character ↔ people_places, same name)** | **13** — Sol, Sam, Abuela, Kelly, Jerry, James, Leslie, Tio Ralph, Step Dad Ben, Ashley De La Cruz, Goth Tio, Baby Bats, Mom |

**The real dedup issue is dual-store duplication** (same person as a `characters` row AND a `people_places` row with different ids) — the same split-brain pattern fixed for locations. These are *context links*: they should resolve to one canonical entity (characters = canonical for people), via `characterDeduplicationService` / `findSimilarCharacter` (Jaro-Winkler) + a people_places→character resolver, mirroring `resolveCanonicalLocationId`.

### Dedup rules to apply
1. **Normalize** before comparing (lowercase, strip punctuation/handles, collapse spaces).
2. **Never** treat a leading kinship title as the identity token — compare on the proper-name remainder (`Tía Grace` vs `Tía Lourdes` → "grace" vs "lourdes" = distinct).
3. **Cross-store link**: a `characters` row and a `people_places` row with matching normalized non-title name + overlapping context (shared entries/threads/locations) → same entity; keep `characters` canonical.
4. **Context links** (not merges): different people who co-occur (same crew/event) get a relationship/scope edge, not a merge.

## 5. How to extend (single source of truth going forward)
New keywords should live in the domain lexicon they belong to (`kinshipGlossary`, `entityClassifier`, `relationshipSignalsFor`, conflict lexicon). This doc is the index of where each lives. Pair with the dynamic-classification model: stable root types + these lexicons as the deterministic first pass, LLM + context as the tie-breaker, user correction as the override.
