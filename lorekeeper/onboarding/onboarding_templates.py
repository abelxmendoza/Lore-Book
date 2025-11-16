"""Onboarding template helpers."""
from __future__ import annotations

from typing import Any, Dict


def markdown_onboarding_summary(briefing: dict[str, Any]) -> str:
    lines = ["# Welcome to LoreKeeper", "## First Week Briefing"]
    lines.append("### Early Themes")
    for theme in briefing.get("early_themes", []):
        lines.append(f"- {theme}")
    lines.append("\n### Suggestions")
    for suggestion in briefing.get("suggestions", []):
        lines.append(f"- {suggestion}")
    return "\n".join(lines)


def compressed_mobile_summary(briefing: dict[str, Any]) -> str:
    themes = ", ".join(briefing.get("early_themes", [])) or "n/a"
    return f"Themes: {themes} | Next: {briefing.get('suggestions', ['Log daily'])[0]}"


def json_onboarding_export(briefing: dict[str, Any]) -> Dict[str, Any]:
    return {
        "identity": briefing.get("identity_baseline"),
        "early_themes": briefing.get("early_themes", []),
        "observations": briefing.get("observations", []),
        "suggestions": briefing.get("suggestions", []),
        "recommended_workflows": briefing.get("recommended_workflows", []),
    }
