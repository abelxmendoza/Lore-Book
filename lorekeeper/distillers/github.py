"""Lightweight GitHub distillation utilities."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import List, Sequence


@dataclass
class GithubMilestone:
    title: str
    summary: str
    timestamp: str
    repo: str
    impact: str
    tags: List[str]


class GithubDistiller:
    def distill(self, raw_events: Sequence[dict]) -> List[GithubMilestone]:
        milestones: List[GithubMilestone] = []
        for event in raw_events:
            milestones.append(self._distill_event(event))
        return milestones

    def _distill_event(self, event: dict) -> GithubMilestone:
        repo = self._resolve_repo(event)
        title = event.get("title") or event.get("event") or "GitHub event"
        summary = self._build_summary(event, repo)
        timestamp = event.get("created_at") or event.get("timestamp") or datetime.utcnow().isoformat()
        impact = "high" if event.get("type") in {"release", "deployment"} else "medium"
        tags = sorted({"github", event.get("type", "event").lower()})

        return GithubMilestone(
            title=title,
            summary=summary,
            timestamp=timestamp,
            repo=repo,
            impact=impact,
            tags=tags,
        )

    def _resolve_repo(self, event: dict) -> str:
        if "repo" in event and isinstance(event["repo"], str):
            return event["repo"]
        repository = event.get("repository")
        if isinstance(repository, dict) and repository.get("full_name"):
            return str(repository["full_name"])
        return "unknown"

    def _build_summary(self, event: dict, repo: str) -> str:
        description = event.get("summary") or event.get("description") or "Activity captured for timeline."
        event_type = event.get("type") or "event"
        return f"[{repo}] {event_type}: {description}"


__all__ = ["GithubMilestone", "GithubDistiller", "asdict"]
