---
name: lorebook-rescan-ops
description: LoreBook conversation rescan, incremental watermarking, validated person keys, and three-strike card review protocol. Use when planning or explaining rescans, suggestion rescans, or deletion-targeted source lore recovery.
---

# LoreBook rescan operations

## Incremental rescan (default)

- Only processes **messages after** the user's rescan watermark.
- Skips **validated person keys** already in the Character Book.
- Does **not** run full `restoreAllCharacters`, archive reactivation, or identity rebuild on incremental passes.

## Full rescan

- Replays all episodes, restores from evidence, reactivates archived cards **except** those in `card_audit_review_queue` (pending review).
- Rebuilds identity index and authority links.

## Card audit on rescan (`cardAudit: true` default)

1. **Confident bad** → auto delete / merge / archive immediately.
2. **Uncertain** → archive + `card_audit_review_queue` (shown in Character suggestions).
3. **3 unresolved rounds** → delete entity protocol + source message re-evaluation.

## Entity deletion exception

When a user deletes a character card, run **targeted source rescan** for messages tied to that card only — not a full validated-lore replay.

## Assistant responses

Assistant replies do **not** create canon or memory without user confirmation. Rescan promotion uses **user-authored** conversation evidence.

## Output format

When given a rescan summary JSON, report:

1. Episodes scanned (incremental vs full).
2. Characters promoted / skipped / restored.
3. Card audit: autoRemoved, queuedForReview, deletedAfterThreeStrikes.
4. Recommended next actions for the user (review queue items, manual audit panel).

Use `scripts/summarize_rescan.py` when a JSON file path is provided.
