"""Templates for rendering monthly arcs."""
from __future__ import annotations

from typing import Any, Dict


def default_md_template(arc: Dict[str, Any]) -> str:
    """Render the standard monthly arc markdown."""

    time_window = arc.get("time_window", "")
    narrative = arc.get("narrative", {})
    weekly_arcs = arc.get("weekly_arcs", [])
    tasks = arc.get("tasks", {})
    themes = arc.get("themes", [])
    epics = arc.get("epics", [])
    drift = arc.get("drift", {})

    lines = [
        f"# 🟣 Monthly Arc — {time_window}",
        "",
        "## 🔥 Opening Hook",
        str(narrative.get("hook", "")),
        "",
        "## 📘 Month’s Main Arc",
        str(narrative.get("arc", "")),
        "",
        "## 🧩 Subplots",
    ]

    for subplot in narrative.get("subplots", []) or []:
        lines.append(f"- {subplot}")
    if not narrative.get("subplots"):
        lines.append("- None recorded.")

    lines.extend([
        "",
        "## ⚡ Turning Points",
    ])
    for turning in narrative.get("turning_points", []) or []:
        lines.append(f"- {turning}")
    if not narrative.get("turning_points"):
        lines.append("- No clear turning points identified.")

    lines.extend([
        "",
        "## 🏁 Resolution",
        str(narrative.get("resolution", "")),
        "",
        "---",
        "",
        "## 📅 Weekly Beats",
    ])

    for week in weekly_arcs:
        week_label = week.get("week_label", "Week")
        week_arc = week.get("arc", {})
        week_narrative = week_arc.get("narrative", {}) if isinstance(week_arc, dict) else {}
        lines.append(f"### {week_label}")
        lines.append(str(week_narrative.get("hook", week_arc if week_arc else "")))
        lines.append(f"- {week_narrative.get('arc', '')}")
    if not weekly_arcs:
        lines.append("No weekly arcs available.")

    lines.extend([
        "",
        "---",
        "",
        "## 📌 Tasks Summary",
        f"- Completed: {tasks.get('completed', [])}",
        f"- Overdue: {tasks.get('overdue', [])}",
        f"- Priority: {tasks.get('priority', [])}",
        f"- Efficiency Score: {tasks.get('efficiency_score', 0.0)}",
        "",
        "---",
        "",
        "## 🎭 Monthly Themes",
    ])

    for theme in themes:
        lines.append(f"- {theme}")
    if not themes:
        lines.append("- No themes identified.")

    lines.extend([
        "",
        "---",
        "",
        "## 🧵 Epics in Motion",
    ])

    for epic in epics:
        title = epic.get("epic", "Epic")
        progress = epic.get("progress", "")
        lines.append(f"### {title}")
        lines.append(str(progress))
        for milestone in epic.get("milestones", []) or []:
            lines.append(f"- {milestone}")
    if not epics:
        lines.append("No epic progress detected.")

    lines.extend([
        "",
        "---",
        "",
        "## ⚠️ Drift Auditor",
        str(drift.get("notes", "")),
    ])

    return "\n".join(lines)


def compressed_md_template(arc: Dict[str, Any]) -> str:
    """Render a condensed, mobile-friendly monthly arc."""

    time_window = arc.get("time_window", "")
    narrative = arc.get("narrative", {})
    tasks = arc.get("tasks", {})
    themes = arc.get("themes", [])

    snippet = " ".join(
        [
            f"🟣 {time_window}",
            f"Hook: {narrative.get('hook', '')}",
            f"Arc: {narrative.get('arc', '')}",
            f"Tasks✓ {len(tasks.get('completed', []))} ✅ / {len(tasks.get('overdue', []))} ❌",
            f"Themes: {', '.join(themes) if themes else 'None'}",
        ]
    )
    return snippet.strip()


__all__ = ["default_md_template", "compressed_md_template"]
