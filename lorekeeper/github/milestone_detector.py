from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from .classifier import classify_event
from .diff_analyzer import estimate_change_size


@dataclass
class IngestedEvent:
    type: str
    message: str
    files: List[str] | None = None
    additions: int | None = None
    deletions: int | None = None


@dataclass
class Milestone:
    title: str
    summary: str
    significance: int
    metadata: dict


def detect_milestones(events: Iterable[IngestedEvent]) -> List[Milestone]:
    """Simple heuristic milestone detector for offline summarization."""

    milestones: List[Milestone] = []
    for event in events:
        classification = classify_event(event, event.files)
        significance = estimate_change_size(event.files or [], event.additions or 0, event.deletions or 0)

        if classification in {"BREAKTHROUGH", "MILESTONE", "ARCHITECTURE", "RELEASE"} or significance >= 4:
            title = f"{classification.title()} update"
            summary = f"{event.message.strip()[:140]}"
            milestones.append(
                Milestone(
                  title=title,
                  summary=summary,
                  significance=max(significance, 5 if classification in {"BREAKTHROUGH", "MILESTONE"} else significance),
                  metadata={"classification": classification, "files": event.files or []},
                )
            )

    if not milestones and events:
        first = next(iter(events))
        milestones.append(
            Milestone(
                title="GitHub progress",
                summary=first.message,
                significance=3,
                metadata={"classification": "FEATURE"},
            )
        )
    return milestones
