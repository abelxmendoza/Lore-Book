# Dating & Romance Analytics Plan

## Current Classification Decision

- Nova should land in `Past` when the evidence says blocked and ghosted.
- Nova should also appear in `No Contact` because blocked/ghosted are practical end-states.
- Nova should not appear in `Reconnection` unless later evidence changes: apology, unblock, renewed contact, mutual interest, or a clear “we are talking again” signal.
- If older memories show affection or unresolved feelings, store that as historical context, not as an active status.

## Filter Model

- `Active`: current relationships that are not ended, blocked, or ghosted.
- `Past`: ended relationships, ex relationships, ghosted connections, and blocked connections.
- `No Contact`: blocked or ghosted relationships.
- `Reconnection`: past relationships with evidence of renewed contact or strong positive current signals.
- `Situationships`: undefined romantic/sexual relationships.
- `Dating`: active dating/partner relationships.
- `Crushes`: crush, obsession, infatuation, or lust.
- `High Risk`: blocked, ghosted, obsession, complicated, low health, or multiple red flags.
- `Rankings`: comparative scoring view.

## Analytics To Add

- `closure_score`: how much clear ending/closure exists.
- `reconciliation_likelihood`: evidence-weighted estimate; never high when blocked/ghosted without new contact.
- `no_contact_strength`: blocked, ghosted, explicit avoidance, or user boundary strength.
- `emotional_volatility`: intensity swings, conflict frequency, push-pull cycles.
- `attachment_risk`: obsession, rumination, repeated harm, unavailable person, or fixation.
- `reciprocity_score`: mutual effort vs one-sided pursuit.
- `signal_recency`: whether evidence is current, stale, or contradicted.

## Data Rules

- Blocked or ghosted overrides “maybe” language and moves the relationship to Past + No Contact.
- Reconnection requires current evidence, not just user hope.
- Dating requires current evidence of dating/partner status.
- Crush can be active without mutual relationship evidence.
- Past can still have high affection or high emotional intensity; status and emotion are separate.

## UI Work

- Add per-card analytics chips: `No Contact`, `Possible Reconnection`, `High Risk`, `Closure Low/High`.
- Add filter counts beside each tab.
- Add a “Why this bucket?” panel in the relationship modal with evidence and confidence.
- Add a manual override control: `Active`, `Past`, `No Contact`, `Reconnection Candidate`.
- Add a backfill action to recompute buckets from existing memories.

## Backend Work

- Extend `romantic_relationships.metadata` with analytics fields instead of requiring an immediate migration.
- Add an analytics recompute service that reads relationship facts, dates, drift, breakup aftermath, and recent messages.
- Add deterministic overrides for blocked/ghosted before any model output.
- Add contradiction handling when new evidence says contact resumed.
- Add tests for Nova-like cases: blocked + ghosted => Past + No Contact, not Reconnection.
