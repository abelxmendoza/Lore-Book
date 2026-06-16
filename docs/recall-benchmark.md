# Recall Benchmark

**Date:** 2026-06-15  
**Engine:** `assembleWorkingMemory` (WorkingMemoryAssembler)  
**Account:** Abel Mendoza (`789bd607-e063-466f-a9ef-f68d24e8bb57`)  
**Pass criteria:** Entity resolved OR ≥3 relevant items with confidence ≥ 0.7

---

## Results summary

| Result | Count |
|--------|-------|
| **Pass** | 25 |
| **Fail** | 0 |
| **Skipped** | 0 |

**Caveat:** Pass threshold is lenient. Many "passes" are **LIFE_REVIEW** fallbacks that return generic recent context without answering the specific question. See quality column below.

---

## 25 natural-language questions

| # | Question | Intent | Conf | Entities resolved | Items | Quality |
|---|----------|--------|------|-------------------|-------|---------|
| 1 | Who is Andrew? | PERSON_QUERY | 0.95 | Andrew the Club Connection, Andrew | 2 | **Good** |
| 2 | What happened with Sol? | RELATIONSHIP_QUERY | 0.95 | Sol (×2) | 7 | **Good** |
| 3 | What did I do with Abuela? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** — generic context, no Abuela link |
| 4 | Tell me about Club Metro | PERSON_QUERY | 0.89 | Me, Hell Fairy, Club Metro | 6 | **Fair** — place found but noisy people |
| 5 | Who lives with me? | LIFE_REVIEW | 0.71 | none | 15 | **Fail quality** — no household answer |
| 6 | What happened at Leslie's graduation party? | EVENT_QUERY | 1.00 | Leslie | 1 | **Fair** — entity only, event deleted as pollution |
| 7 | What role did Kelly play? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** — no Kelly-specific role |
| 8 | Who is Tío Juan? | PERSON_QUERY | 0.90 | Tío Juan, Tio Juan | 5 | **Good** |
| 9 | Tell me about LoreBook | PROJECT_QUERY | 0.70 | LoreBook | 8 | **Good** |
| 10 | What happened at Amazon onboarding? | PLACE_QUERY | 0.82 | Amazon onboarding | 1 | **Fair** |
| 11 | Who is Ashley De La Cruz? | PERSON_QUERY | 0.94 | Ashley De La Cruz (×2) | 3 | **Good** |
| 12 | What is Hell Fairy? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** — triple-typed entity not disambiguated |
| 13 | Who is Rafeh Qazi? | PERSON_QUERY | 0.95 | Rafeh Qazi, My Coding Mentor | 2 | **Fair** — name pollution |
| 14 | Tell me about my family | PERSON_QUERY | 0.73 | my family | 3 | **Weak** — literal string match |
|  15 | What happened with Jerry? | RELATIONSHIP_QUERY | 0.90 | Jerry (×2) | 4 | **Good** |
| 16 | Where is Moreno Valley? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** — place exists but not resolved |
| 17 | What is Amazon Ring? | LIFE_REVIEW | 0.71 | none | 15 | **Good post-repair** — correctly no character |
| 18 | Who is Step Dad Ben? | PERSON_QUERY | 0.95 | Step Dad Ben (×2) | 2 | **Good** |
| 19 | What happened at Club Metro anniversary? | PLACE_QUERY | 1.00 | Me | 1 | **Weak** |
| 20 | Who is Goth Tio? | PERSON_QUERY | 0.89 | Goth Tio (×2) | 5 | **Good** |
| 21 | Tell me about Baby Bats | PERSON_QUERY | 0.90 | Baby Bats (×2) | 4 | **Good** |
| 22 | What did I build at Abuela's house? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** — thread exists, not retrieved |
| 23 | Who is Mr. Chino? | PERSON_QUERY | 0.90 | Mr. Chino | 4 | **Good** |
| 24 | What gyms do I go to? | LIFE_REVIEW | 0.71 | none | 15 | **Weak** |
| 25 | What happened with Oscuri.dad? | RELATIONSHIP_QUERY | 0.90 | Oscuri.dad | 4 | **Good** |

---

## Quality-adjusted score

| Tier | Count | Description |
|------|-------|-------------|
| **Good** | 11 | Correct entity + relevant items |
| **Fair** | 4 | Partial answer |
| **Weak** | 10 | Generic LIFE_REVIEW fallback |

**Recall accuracy (strict):** **11/25 = 44%** good answers  
**Recall accuracy (lenient):** **25/25 = 100%** returns non-empty packet

---

## Failure patterns

1. **LIFE_REVIEW fallback** — relational/activity questions without explicit name in pattern → generic 15 items, no targeted answer
2. **Duplicate entities** — confidence inflated by double-counting Tio/Tío, Andrew variants
3. **Event queries after pollution repair** — Graduation Party entity removed; EVENT_QUERY finds Leslie only
4. **Place queries misclassified** — "Amazon onboarding" → PLACE_QUERY not CAREER
5. **No graph traversal** — "Who lives with me?" cannot walk household/family edges (none exist)

---

## Examples of strong recall

```
Who is Andrew? → Andrew the Club Connection (PERSON) + 2 items, conf 0.95
What happened with Sol? → Sol (PERSON) + 7 items, conf 0.95
Who is Tío Juan? → Tío Juan + Tio Juan + 5 items, conf 0.90
Tell me about LoreBook → LoreBook (PROJECT) + 8 items, conf 0.70
```

---

## Examples of weak recall

```
What did I do with Abuela? → no entity, 15 generic items
Who lives with me? → no entity, no household
What role did Kelly play? → no entity despite Kelly existing in graph
Where is Moreno Valley? → no entity despite place existing (post-repair)
What did I build at Abuela's house? → thread "Building Lorebook At Abuelas" not retrieved
```

---

## Re-run

```bash
cd apps/server && npx tsx -e "
import { assembleWorkingMemory } from './src/services/chat/workingMemoryAssembler.ts';
const q = 'Who is Andrew?';
const r = await assembleWorkingMemory({ userId: '789bd607-e063-466f-a9ef-f68d24e8bb57', question: q });
console.log(r.entities, r.confidence);
"
```
