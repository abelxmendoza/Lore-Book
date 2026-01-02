from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Iterable, List

from .milestone_detector import IngestedEvent, detect_milestones


@dataclass
class SummarizedMilestone:
    title: str
    summary: str
    significance: int
    metadata: dict


def summarize_milestones(events: Iterable[dict]) -> List[SummarizedMilestone]:
    normalized_events = [
        IngestedEvent(
            type=item.get("type", "update"),
            message=item.get("message", item.get("title", "")),
            files=item.get("files") or [],
            additions=item.get("additions"),
            deletions=item.get("deletions"),
        )
        for item in events
        if isinstance(item, dict)
    ]

    detected = detect_milestones(normalized_events)

    cleaned: List[SummarizedMilestone] = []
    for milestone in detected:
        cleaned.append(
            SummarizedMilestone(
                title=milestone.title,
                summary=milestone.summary,
                significance=milestone.significance,
                metadata=milestone.metadata,
            )
        )
    return cleaned


def _cli() -> None:
    payload = json.loads(input() or "{}")
    events = payload.get("events", [])
    milestones = summarize_milestones(events)
    if milestones:
        top = max(milestones, key=lambda m: m.significance)
    else:
        top = SummarizedMilestone(
            title="GitHub milestone",
            summary="Captured meaningful GitHub activity.",
            significance=3,
            metadata={},
        )
    print(json.dumps(asdict(top)))


if __name__ == "__main__":
    _cli()
