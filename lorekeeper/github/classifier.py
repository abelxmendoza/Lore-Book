from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

KEYWORDS = {
    "FEATURE": ["add", "feature", "implement", "build", "introduce", "engine"],
    "BUGFIX": ["fix", "bug", "issue", "patch", "regression"],
    "REFACTOR": ["refactor", "cleanup", "restructure", "tidy"],
    "RELEASE": ["release", "tag", "version"],
    "ARCHITECTURE": ["core", "framework", "architecture", "infra"],
    "DOCUMENTATION": ["docs", "readme", "guide", "document"],
    "COLLABORATION": ["merge", "pair", "co-authored"],
    "BREAKTHROUGH": ["breakthrough", "milestone", "launch", "rewrite"],
    "RESEARCH": ["experiment", "spike", "prototype", "research"],
    "MILESTONE": ["milestone", "launch", "season"],
}


@dataclass
class GithubEvent:
    type: str
    message: str
    files: List[str] | None = None


def classify_event(event: GithubEvent | str, files: Iterable[str] | None = None) -> str:
    message = event.message if isinstance(event, GithubEvent) else str(event)
    lower = message.lower()
    file_list = list(files or (event.files if isinstance(event, GithubEvent) else []))
    if any(name.lower().endswith(".md") or "readme" in name.lower() for name in file_list):
        return "DOCUMENTATION"

    for label, keywords in KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            return label

    if any("src/core" in name or "src/engine" in name for name in file_list):
        return "ARCHITECTURE"

    return "FEATURE"
