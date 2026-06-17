# Working Memory Assembler

Status: prototype implemented in `apps/server/src/services/chat/workingMemoryAssembler.ts`.

## What Working Memory Is

Working Memory is the temporary, task-specific context LoreBook assembles for one question. It is not a database, not a full graph traversal, and not "all relevant memories." It is the smallest ranked packet of evidence the assistant needs to answer the current question with trust.

Working Memory answers:

- What is the user asking about?
- Which entities are central?
- Which memories prove the answer?
- Which related edges matter?
- Which context should be excluded even though it exists?
- How confident should LoreBook be?

## How It Differs From Stored Memory

Long-term memory is durable storage: journal entries, chat messages, facts, entities, relationships, timelines, biographies, and derived accounts.

Graph storage is the persistent map of entities and edges. It can contain thousands of nodes. Working Memory selects a tiny subgraph for the current question.

Timeline storage is the chronological record of events. Working Memory selects only the timeline moments that explain the question.

Character storage is the durable Character Book. Working Memory includes a character only when that character is relevant to the intent, not because the character exists.

Working Memory is discarded after the turn. It is an assembly product, not a new source of truth.

## Intent Categories

| Intent | Example | Primary Target |
| --- | --- | --- |
| `PERSON_QUERY` | "What do you know about Ashley?" | A person/character profile |
| `PLACE_QUERY` | "What happened at Club Metro?" | A location/place scene |
| `PROJECT_QUERY` | "How is LoreBook progressing?" | A project and recent progress |
| `EVENT_QUERY` | "What happened at Leslie's graduation?" | An event or timeline moment |
| `LIFE_REVIEW` | "What have I been doing lately?" | Recent episodes + timeline |
| `RELATIONSHIP_QUERY` | "What do you remember about Sol?" | A person plus relationship edges |
| `IDENTITY_QUERY` | "What kind of person am I?" | Narrative accounts, values, preferences |
| `DEBUG_QUERY` | "Did you save that?" | Current thread + memory formation state |

## Context Rules By Intent

### PERSON_QUERY

Required:

- Character/entity record.
- Character memories.
- Character timeline moments.
- Character facts.
- Biography summary if present.

Optional:

- Relationship edges if they explain the person.
- Recent chat mentions if no durable memories exist.

Excluded:

- Unrelated projects, locations, organizations, shopping, apps, or generic biography text.

### PLACE_QUERY

Required:

- Location or `people_places` place entity.
- Journal/chat episodes mentioning the place.
- Participants and activities when available.

Optional:

- Location-character links.
- Timeline events at that place.

Excluded:

- Unrelated people who do not appear in the place scene.
- Global biography unless the place is identity-significant.

### PROJECT_QUERY

Required:

- Project row if present.
- Recent tasks/status rows if present.
- Recent journal/chat episodes mentioning the project.

Optional:

- Timeline milestones.
- Narrative account references if the project is life-defining.

Excluded:

- Unrelated personal relationships, places, or products.

### EVENT_QUERY

Required:

- Timeline event matches.
- Journal/chat episodes mentioning the event.
- Participating characters if known.

Optional:

- Event facts and significance.
- Relationship edges if the event is relationship-centered.

Excluded:

- Full life recap.
- Character roster.

### LIFE_REVIEW

Required:

- Recent episodes.
- Recent timeline events.
- Recent biography/narrative snapshots.

Optional:

- Projects and relationships with strong recency/significance.

Excluded:

- Old facts unless they are high significance.
- Entire character/location/project lists.

### RELATIONSHIP_QUERY

Required:

- Target character.
- Relationship edges.
- Relationship facts.
- Relationship-relevant episodes.

Optional:

- Romantic relationship record.
- Timeline moments shared with the person.

Excluded:

- Unrelated biography, skills, places, products.

### IDENTITY_QUERY

Required:

- Biography snapshots.
- Revealed preferences/values when available.
- Significant recent patterns.

Optional:

- Timeline arcs and repeated decisions.

Excluded:

- Single low-confidence memories.
- Random character or place mentions.

### DEBUG_QUERY

Required:

- Current thread messages.
- Save/formation diagnostics.
- Recently created memory/entity rows when available.

Optional:

- Rejected/weak candidates explaining why nothing was saved.

Excluded:

- Biography or story recall unless the debug question names an entity.

## Ranking Formula

Each candidate context item is scored:

```text
score =
  0.38 * relevance +
  0.18 * importance +
  0.16 * recency +
  0.14 * significance +
  0.08 * relationship_distance +
  0.06 * confidence
```

Definitions:

- `relevance`: direct match to question target and intent.
- `importance`: entity/event/project importance score, or a conservative default.
- `recency`: logarithmic bucket based on age; last week scores highest.
- `significance`: explicit significance score, biography presence, or meaning-bearing tags.
- `relationship_distance`: direct target adjacency beats distant graph context.
- `confidence`: source confidence, fact confidence, or storage confidence.

Complexity target:

- Entity lookup should use indexed equality/name paths where possible.
- Direct entity retrieval should be approximately `O(log n)` database lookup plus bounded fan-out.
- Ranking is `O(k log k)` where `k` is already bounded by per-source limits.
- The prototype caps source reads before ranking and caps final Working Memory to a small budget.

## Working Memory Budget

Default budget: 20 context items.

The budget exists to prevent giant prompts and context bloat. The assembler keeps the highest-scoring evidence and records rejected candidates for debugging/evaluation.

Budget behavior:

- Select top 20 ranked items.
- Preserve source diversity by querying bounded sets from each table.
- Exclude weak or distant context even if it matches text.
- Return rejected items with reasons such as "outside working-memory budget" or "below working-memory relevance threshold."

## Failure Cases

### No Memory Found

Return the detected intent, unresolved target entity, empty context arrays, and low confidence. The assistant should say it does not have enough memory, not invent an answer.

### Weak Memory Found

Return weak items with low confidence. The assistant should qualify the answer: "I have a weak trace..." or "I only found one mention..."

### Conflicting Memories

If conflicting facts are retrieved, both should be included with confidence/source labels. Generation should explain the conflict rather than flattening it.

### Unverified Memories

Unverified or low-confidence items should rank below verified facts, character memories, and timeline events. They can still be included if the budget has room and no better evidence exists.

### Unknown Entities

Unknown entities remain in `entities` with `source = question`. The assembler should not treat unknowns as people or create Character assumptions.

## Prototype Output

`assembleWorkingMemory({ question, userId, threadId })` returns:

```ts
{
  intent,
  entities,
  episodes,
  events,
  projects,
  relationships,
  preferences,
  timeline,
  confidence
}
```

The prototype also includes `budget` and `rejected` for evaluation/debugging.

## Evaluation Targets

| Target | Expected Selection | Expected Rejection |
| --- | --- | --- |
| Ashley | Character, Ashley memories, Ashley timeline, Ashley relationship/facts. | LoreBook project context, Amazon, Costco. |
| Sol | Relationship edges, relevant memories, relationship facts. | Unrelated family/project memories. |
| Abuela | Family relationship, family memories, timeline moments. | Romantic/project context. |
| Tio Juan | Character/family edge if known, timeline and memories. | Bare unrelated Juan ambiguity unless resolved. |
| Leslie | Character memories/events. | Club/organization/product context unless mentioned in selected memories. |
| Club Metro | Place scene, journal/chat mentions, participants. | Robotics, Amazon, Costco unless actually in the scene. |
| LoreBook | Project/task/progress memories. | Personal relationship context unless tied to project progress. |
| Amazon | Organization/product references only. | Character context. |
| Costco | Place/organization/shop episode references. | Character context unless a person was present in the episode. |

## Trust Contract

The assembler is not allowed to answer. It only chooses evidence.

Generation must respect:

- If the assembler selected nothing, say memory is missing.
- If confidence is low, answer with uncertainty.
- If the target entity is unknown, do not promote or anthropomorphize it.
- If selected and rejected context show ambiguity, ask a clarification question.
