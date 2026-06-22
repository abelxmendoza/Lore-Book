#!/usr/bin/env python3
"""Summarize a LoreBook character rescan summary JSON."""

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: summarize_rescan.py <rescan-summary.json>", file=sys.stderr)
        return 1

    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    audit = data.get("cardAudit") or {}
    cleanup = data.get("cardCleanup") or {}

    lines = [
        "# Rescan summary",
        "",
        f"- Episodes scanned: {data.get('scannedEpisodes', 0)}",
        f"- Incremental: {data.get('incremental', False)}",
        f"- Promoted: {data.get('charactersPromoted', 0)}",
        f"- Skipped (known): {data.get('charactersSkipped', 0)}",
        f"- Restored from evidence: {data.get('restoredFromEvidence', 0)}",
        "",
        "## Card audit",
        f"- Auto removed: {audit.get('autoRemoved', 0)}",
        f"- Queued for review: {audit.get('queuedForReview', 0)}",
        f"- Deleted (3 strikes): {audit.get('deletedAfterThreeStrikes', 0)}",
        "",
        "## Cleanup actions",
        f"- Applied: {cleanup.get('applied', 0)}",
        f"- Skipped: {cleanup.get('skipped', 0)}",
    ]

    suggestions = audit.get("reviewSuggestions") or []
    if suggestions:
        lines.extend(["", "## Review queue", ""])
        for s in suggestions:
            lines.append(
                f"- **{s.get('name', '?')}** round {s.get('reviewRound', '?')}/"
                f"{s.get('maxRounds', 3)} — {s.get('reason', '')}"
            )

    promoted = data.get("promotedNames") or []
    if promoted:
        lines.extend(["", "## Promoted names", ", ".join(promoted)])

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
