"""GitHub adapter for the External Hub."""

from typing import Dict, Iterable, List

from ..schemas import ExternalEvent


def normalize_github(payload: Dict) -> List[ExternalEvent]:
    commits: Iterable[Dict] = payload.get("commits", [])
    milestones: Iterable[Dict] = payload.get("milestones", [])

    commit_events = [
        ExternalEvent(
          source="github",
          timestamp=commit.get("timestamp", ""),
          type="commit",
          text=commit.get("message", ""),
          tags=["commit"],
        )
        for commit in commits
    ]

    milestone_events = [
        ExternalEvent(
            source="github",
            timestamp=ms.get("closed_at") or ms.get("created_at") or "",
            type="milestone",
            text=ms.get("description") or ms.get("title") or "",
            tags=["milestone"],
        )
        for ms in milestones
    ]

    return commit_events + milestone_events
