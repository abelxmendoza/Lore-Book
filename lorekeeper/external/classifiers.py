"""Classifiers for external events."""

from typing import Iterable, List

from .schemas import ExternalEvent

KEYWORDS = ("ship", "launch", "release", "milestone", "highlight")


def detect_milestone(event: ExternalEvent) -> str | None:
    if event.milestone:
        return event.milestone

    if event.type in {"milestone", "story_highlight", "release"}:
        return event.type

    text = (event.text or "").lower()
    for keyword in KEYWORDS:
        if keyword in text:
            return keyword
    return None


def classify(events: Iterable[ExternalEvent]) -> List[ExternalEvent]:
    milestones: List[ExternalEvent] = []
    for event in events:
        marker = detect_milestone(event)
        if marker:
            event.milestone = marker
            milestones.append(event)
    return milestones
