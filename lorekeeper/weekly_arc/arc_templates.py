"""Templates for rendering weekly arcs."""
from __future__ import annotations

import json
from textwrap import dedent
from typing import Any


def _list_block(items: list[str]) -> str:
    if not items:
        return "- None"
    return "\n".join(f"- {item}" for item in items)


def default_md_template(arc: dict[str, Any]) -> str:
    narrative = arc.get("narrative", {})
    events = arc.get("events", {})
    tasks = arc.get("tasks", {})
    drift = arc.get("drift", {})
    themes = arc.get("themes", [])
    epics = arc.get("epics", [])

    stats_text = json.dumps(events.get("stats", {}), indent=2)

    template = f"""
    # 🟣 Weekly Arc — {arc.get('time_window', '')}

    ## 🔥 Opening Hook
    {narrative.get('hook', '')}

    ## 📘 Main Arc
    {narrative.get('arc', '')}

    ## 🧩 Subplots
    {_list_block(narrative.get('subplots', []))}

    ## 🧨 Cliffhanger for Next Week
    {narrative.get('cliffhanger', '')}

    ## 📅 Events Summary
    {stats_text}

    ## 📌 Tasks Summary
    - Completed: {tasks.get('completed', [])}
    - Overdue: {tasks.get('overdue', [])}
    - Priority Focus: {tasks.get('priority', [])}
    - Efficiency Score: {tasks.get('efficiency_score', 0.0)}

    ## ⚠️ Drift Auditor
    {drift.get('notes', '')}

    ## 🎭 Themes of the Week
    {_list_block(themes)}

    ## 🧵 Epics In Motion
    {_list_block(epics)}
    """
    return dedent(template).strip() + "\n"


def compressed_md_template(arc: dict[str, Any]) -> str:
    narrative = arc.get("narrative", {})
    tasks = arc.get("tasks", {})
    themes = arc.get("themes", [])

    summary_line = " | ".join(
        [
            f"Week: {arc.get('time_window', '')}",
            f"Hook: {narrative.get('hook', '')}",
            f"Efficiency: {tasks.get('efficiency_score', 0.0):.2f}",
            f"Themes: {', '.join(themes) if themes else 'n/a'}",
        ]
    )
    return summary_line + "\n"
