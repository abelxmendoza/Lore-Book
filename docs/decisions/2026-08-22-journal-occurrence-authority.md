# Journal occurrence-date authority

**Decision:** Keep the `apps/server/src/services/temporal/**` design already
landed on `main` in `92a6e425`; close PR #318 as superseded.

## Context

Two implementations addressed the same invariant: a journal row's recording
time must never masquerade as when the remembered event occurred.

- PR #318 introduced `journalOccurrenceStorage.ts` and a nullable occurrence
  migration across a broad 48-file change.
- The parallel temporal workstream introduced `journalOccurrenceWrite.ts`,
  `journalMemoryTemporalLoader.ts`, `journalOccurrenceRepairService.ts`, and
  `explicitOccurrence.ts`, then landed on `main` in `92a6e425`.

Both agree on the storage contract:

| Clock | Authority |
| --- | --- |
| Occurrence | `journal_entries.date`, nullable |
| Mention | source/message time retained as evidence |
| Recording | `journal_entries.created_at` / `recordedAt` |

Unknown occurrence stays null and is omitted from dated chronology. Recording
time is never substituted for occurrence.

## Why the temporal workstream wins

1. **One write authority.** All new journal writes resolve through
   `journalOccurrenceWrite.ts`. Merging #318 would add a competing planner in
   `journalOccurrenceStorage.ts` and leave two names and contracts for the same
   decision.
2. **Three clocks remain explicit.** The winning design carries `occurredAt`,
   `mentionedAt`, and `recordedAt` independently through classification and
   metadata instead of treating nullability as the whole model.
3. **Canonical events win.** `journalMemoryTemporalLoader.ts` resolves stable
   event linkage and uses canonical event occurrence without manufacturing a
   second journal date.
4. **Importers are covered.** `explicitOccurrence.ts` and importer contract
   tests prevent source timestamps, upload timestamps, and photo processing
   times from becoming occurrence by default.
5. **Repair is governed.** The tenant-scoped repair service defaults to dry-run,
   preserves ambiguous legacy rows, and only mutates explicitly classified
   cases when apply is requested.
6. **It is already the implementation on main.** Rebasing #318 would replace or
   duplicate landed authority and reopen unrelated server and web surfaces.

## Consequences

- `journalOccurrenceWrite.ts` is the sole journal occurrence write policy.
- `journalMemoryTemporal.ts` and its loader are the read/classification policy.
- `20260821120000_journal_occurrence_nullable.sql` is the sole repository
  migration for this contract.
- PR #318 must remain closed and must not be partially cherry-picked.
- Future changes extend these authorities; they must not create another journal
  occurrence classifier or write planner.

## Verification

The required temporal service and Working Memory regression suite is run from
this decision PR:

```bash
npm test --prefix apps/server -- --run src/services/temporal/ tests/services/workingMemoryAssembler.test.ts
```

