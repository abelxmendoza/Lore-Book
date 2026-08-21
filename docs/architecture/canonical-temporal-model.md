# Canonical Temporal Model

LoreBook treats time as evidence, not as a timestamp copied from the message
that described an event.

```text
Source evidence
    |
    +-- occurred      when the event happened
    +-- mentionedAt   when the user described it
    +-- recordedAt    when LoreBook persisted it
    +-- knownFrom     when LoreBook first knew it
    +-- validFrom     when an assertion became true
    +-- validUntil    when an assertion stopped being true
```

Each canonical temporal projection also carries precision, confidence, source,
status, the original expression, and field-level provenance. Recording time is
never promoted into occurrence time.

## Precision

Supported occurrence precision includes exact time, day, week, month, season,
quarter, year, approximate, and unknown. Coarse periods may use range boundaries
internally for ordering, but renderers must display the stated precision. A
year-level value such as `2023` must render as `2023`, never `Jan 1, 2023`.

## Ordering

Canonical chronology sorts by:

1. occurred time;
2. validity start when occurrence is unknown;
3. recording time only as a final ordering fallback for unresolved knowledge.

Mention and insertion order do not rewrite life chronology.

## Projection and migration strategy

The first implementation is a read-compatible adapter over existing records:

- the shared stitched feed exposes the canonical temporal object;
- legacy `sortTime` remains temporarily for older UI consumers;
- unknown occurrence stays null at the ingestion stage contract;
- chat and conversation sources without temporal evidence are unresolved;
- timeline speech-act gates exclude questions, recap prompts, commands, product
  debugging, and other non-events;
- subject compilers apply domain gates before building career timelines.

No database migration or historical rewrite is part of this slice. A later
materialization can add dedicated columns only after the migration ledger is
safe and parity tests prove that the adapters preserve existing behavior.

## Write-time contract

`journal_entries.date` means occurrence only. It may be null.

| Clock | Meaning | Storage |
| --- | --- | --- |
| `occurredAt` / `journal_entries.date` | When the real-world event happened | Nullable. Never `now()` just because occurrence is missing. |
| `mentionedAt` | When the user spoke or wrote about it | Metadata / chat created_at |
| `recordedAt` / `created_at` | When LoreBook persisted the row | Database insert time |

Those three clocks may all differ. Example: on August 20 the user writes “Last month I went to a concert.” Occurrence is July (month precision), mention and recording are August 20.

No temporal evidence, or “I don’t know when,” must store:

- occurred = unknown (`date` null)
- mentioned = today
- recorded = today

`chronology_index` indexes occurrence. Unknown occurrence is omitted from the dated index; it is not filled with `COALESCE(date, NOW())`.

Until `20260821120000_journal_occurrence_nullable.sql` is applied, a NOT NULL `date` column may still force a transitional `recording_fallback` stamp. Canonical readers must reject that stamp as occurrence.

## Required invariants

- `occurredAt` may be null; `recordedAt` may not fill it.
- Never use `recordedAt` as `occurredAt` just because `occurredAt` is missing.
- Relative expressions use the source message timestamp as the resolver anchor.
- Unknown and coarse dates never gain fabricated display precision.
- Global timelines contain canonical life events, not conversation prompts.
- Career timelines contain career-domain events and relegate incidental employer
  mentions to background context.
- Every displayed temporal value is explainable through provenance.
