"""Templates for rendering daily executive briefings."""
from __future__ import annotations

from typing import Any, Dict


def default_md_template(briefing: Dict[str, Any]) -> str:
    """Render a full markdown briefing."""

    sections = briefing.get("sections", {})
    narrative = sections.get("narrative", {})
    tasks = sections.get("tasks", {})
    drift = sections.get("drift", {})
    date = briefing.get("timestamp", "").split("T")[0]

    return "\n".join(
        [
            f"# 🟣 Daily Executive Briefing — {date}",
            "",
            "## 🔹 Yesterday",
            str(narrative.get("yesterday", "")),
            "",
            "## 🔹 Last 7 Days",
            str(narrative.get("last_week", "")),
            "",
            "## 🔹 Tasks Today",
            str(tasks.get("due_today", [])),
            "",
            "## 🔹 Overdue Tasks",
            str(tasks.get("overdue", [])),
            "",
            "## 🔹 Priority Focus",
            str(tasks.get("priority", [])),
            "",
            "## 🔹 Drift Auditor Notes",
            str(drift.get("notes", "")),
        ]
    )


def compressed_md_template(briefing: Dict[str, Any]) -> str:
    """Render a short markdown snippet suitable for notifications."""

    sections = briefing.get("sections", {})
    narrative = sections.get("narrative", {})
    tasks = sections.get("tasks", {})
    drift = sections.get("drift", {})
    date = briefing.get("timestamp", "").split("T")[0]

    return " ".join(
        [
            f"🟣 {date}",
            f"Yesterday: {narrative.get('yesterday', '')}.",
            f"Today: {tasks.get('due_today', [])}",
            f"Overdue: {tasks.get('overdue', [])}",
            f"Priority: {tasks.get('priority', [])}",
            f"Drift: {drift.get('notes', '')}",
        ]
    )


__all__ = ["default_md_template", "compressed_md_template"]
