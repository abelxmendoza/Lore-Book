# Canonical Temporal Model

LoreBook treats time as evidence, not as a timestamp copied from the message
that described an event.

These three clocks are independent. They may all differ.

```text
OCCURRED     When the real-world event happened.
MENTIONED    When the user told LoreBook about it.
RECORDED     When LoreBook persisted the record.
```

`recordedAt` must never be used as `occurredAt` merely because `occurredAt`
is unknown. Unknown means unknown. Recording time is provenance, not biography.

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

## Journal storage

`journal_entries.date` is **occurrence only** and is nullable.

| Field | Clock |
| --- | --- |
| `journal_entries.date` / `timestamp` | OCCURRED (null = unknown) |
| `journal_entries.created_at` | RECORDED |
| `metadata.temporal_source` / `temporal_precision` / `temporal_expression` | evidence |
| linked `resolved_events.start_time` via `metadata.source_entry_id` | canonical OCCURRED (wins) |

Do not store `created_at` in `date` when occurrence is unknown.
`sync_chronology_index` indexes dated occurrence only. A null date omits the
row from `chronology_index`; it does not `COALESCE(date, NOW())`.

Historical `date == created_at` rows without `temporal_source` are
`ambiguous_legacy`. They are not silently rewritten. Use
`npm run journal-temporal:audit -- --user-id <uuid>` (dry-run, never mutates).

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

Journal occurrence is stored on `journal_entries.date` (nullable). Canonical
events keep `CanonicalTemporalModel` on `resolved_events`. Journals that link
through `metadata.source_entry_id` reuse that event id; they do not duplicate it.

Unknown occurrence stays null at write time. `sync_chronology_index` omits
undated journals from dated chronology. Stitched / Omni unresolved trays keep
them retrievable without a start_time.

## Required invariants

- `occurredAt` may be null; `recordedAt` may not fill it.
- Relative expressions use the source message timestamp as the resolver anchor.
- Unknown and coarse dates never gain fabricated display precision.
- Global timelines contain canonical life events, not conversation prompts.
- Career timelines contain career-domain events and relegate incidental employer
  mentions to background context.
- Every displayed temporal value is explainable through provenance.
