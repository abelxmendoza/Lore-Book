---
name: lorebook-character-card-audit
description: Audit LoreBook Character Book cards for junk, bare titles, wrong domain, broken spans, duplicates, and ambiguous identities. Use when reviewing character cards, rescan cleanup, or card audit reports.
---

# LoreBook character card audit

Use this skill when analyzing Character Book cards or an audit report JSON from LoreBook.

## Goals

1. Identify **confident bad** cards (auto-remove candidates).
2. Flag **uncertain** cards for human review in suggestions (not immediate delete).
3. Never treat assistant chat text as canon without user confirmation.

## Status taxonomy

| Status | Meaning | Typical action |
|--------|---------|----------------|
| `junk_test_data` | Placeholder/test name (e.g. foo) | delete |
| `bare_title_invalid` | Generic bare title (Mr, Uncle alone) | delete |
| `wrong_domain` | Group/interest/system, not a person | archive, move, or delete |
| `broken_span` | Truncated possessive (Tío Ralph's → Tio Ralph) | merge |
| `duplicate_or_merge_candidate` | Likely same person as another card | merge or review |
| `needs_context` | Ambiguous label (new guy, Cousin) | queue for review |
| `needs_identity_resolution` | Same label, different people | keep separate or rename with context |
| `valid_contextual_reference` | Role + context (cousin from Dallas) | rename_with_context or keep |
| `valid_identity` | Real named identity | keep |

## Confident auto-fix (rescan)

Apply without user review when ALL are true:

- Not previously reviewed (`card_audit_review` absent, not `card_audit_locked`).
- Status is junk, bare title, wrong domain (clear), broken span with merge target, or high-confidence rename (≥0.85).

## Uncertain → suggestions queue

Archive and set `card_audit_review_queue` when:

- `needs_context`, `duplicate_or_merge_candidate`, `needs_identity_resolution`
- `recommendedAction === needs_review`
- Rename suggested but title unclear

Each rescan increments `round`. At **3 rounds** without user keep/delete → delete with lore redistribution and source message re-evaluation.

## User override

If `metadata.card_audit_review.action` is set (`keep` | `delete` | `rename`), **never** auto-remove again.

## Output format

Produce:

1. **Summary** — counts by status and recommended action.
2. **Auto-remove list** — id, title, reason.
3. **Review queue** — id, title, round, suggested title, reason.
4. **Keep list** — valid identities with brief justification.

Use `scripts/format_audit_report.py` when a JSON audit file path is provided.
