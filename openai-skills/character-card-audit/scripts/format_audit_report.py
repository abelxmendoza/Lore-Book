#!/usr/bin/env python3
"""Format a LoreBook character card audit JSON file as markdown."""

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: format_audit_report.py <audit.json>", file=sys.stderr)
        return 1

    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))
    results = data.get("results") or []

    by_status: dict[str, list] = {}
    for row in results:
        status = row.get("status", "unknown")
        by_status.setdefault(status, []).append(row)

    lines = [
        "# Character card audit report",
        "",
        f"- User: `{data.get('userId', '?')}`",
        f"- Generated: {data.get('generatedAt', '?')}",
        f"- Cards: {data.get('characterCount', len(results))}",
        "",
        "## Summary by status",
        "",
    ]

    summary = data.get("summary") or {}
    for status, count in sorted(summary.items(), key=lambda x: -x[1]):
        lines.append(f"- **{status}**: {count}")

    for status, rows in sorted(by_status.items()):
        lines.extend(["", f"## {status} ({len(rows)})", ""])
        for row in rows:
            title = row.get("currentTitle", "?")
            action = row.get("recommendedAction", "?")
            reason = row.get("reason", "")
            lines.append(f"- **{title}** → `{action}` — {reason}")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
