"""Templates for rendering SeasonEngine output."""

from __future__ import annotations

from typing import Any


def _safe_get(source: dict[str, Any], key: str, default: Any = "") -> Any:
    value = source.get(key, default)
    return value if value is not None else default


def default_md_template(season: dict[str, Any]) -> str:
    narrative = season.get("narrative", {}) or {}
    monthly_arcs = season.get("monthly_arcs", []) or []
    themes = season.get("themes", []) or []
    epics = season.get("epics", []) or []
    lines = [
        f"# 🟣 Season {season.get('season_label', '')} — {season.get('time_window', '')}",
        "",
        "## 🔥 Opening",
        _safe_get(narrative, "opening", ""),
        "",
        "## 📘 Main Arc",
        _safe_get(narrative, "main_arc", ""),
        "",
        "## 🧩 Subplots",
    ]
    for subplot in narrative.get("subplots", []) or []:
        lines.append(f"- {subplot}")
    lines.extend([
        "",
        "## ⚡ Turning Points",
    ])
    for point in narrative.get("turning_points", []) or []:
        lines.append(f"- {point}")
    lines.extend([
        "",
        "## 🔥 Climax",
        _safe_get(narrative, "climax", ""),
        "",
        "## 🏁 Resolution",
        _safe_get(narrative, "resolution", ""),
        "",
        "## 🌅 Hook for Next Season",
        _safe_get(narrative, "next_season_hook", ""),
        "",
        "---",
        "",
        "## 📅 Monthly Breakdowns",
    ])
    for month in monthly_arcs:
        lines.append(f"### {month.get('label', '')}")
        hook = month.get("arc", {}).get("narrative", {}).get("hook", "")
        lines.append(str(hook))
    lines.extend([
        "",
        "---",
        "",
        "## 🎭 Themes of the Season",
    ])
    for theme in themes:
        lines.append(f"- {theme}")
    lines.extend([
        "",
        "---",
        "",
        "## 🧵 Epic Arcs",
    ])
    for epic in epics:
        lines.append(f"### {epic.get('epic', '')}")
        lines.append("Phases:")
        for phase in epic.get("phases", []) or []:
            lines.append(f"- {phase}")
        lines.append("Milestones:")
        for milestone in epic.get("key_milestones", []) or []:
            lines.append(f"- {milestone}")
    lines.extend([
        "",
        "---",
        "",
        "## ⚠️ Drift Auditor",
        str(season.get("drift", {}).get("notes", "")),
    ])
    return "\n".join(lines)


def compressed_md_template(season: dict[str, Any]) -> str:
    narrative = season.get("narrative", {}) or {}
    themes = season.get("themes", []) or []
    epics = season.get("epics", []) or []
    lines = [
        f"# Season {season.get('season_label', '')}",
        _safe_get(narrative, "opening", ""),
        _safe_get(narrative, "main_arc", ""),
        "Themes: " + ", ".join(str(t) for t in themes[:5]),
        "Epics: " + ", ".join(epic.get("epic", "") for epic in epics[:3]),
        "Climax: " + _safe_get(narrative, "climax", ""),
        "Next: " + _safe_get(narrative, "next_season_hook", ""),
    ]
    return "\n".join(lines)
