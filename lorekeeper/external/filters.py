"""Noise filtering for external events."""

from typing import Iterable, List

from .schemas import ExternalEvent


ALWAYS_ALLOW_TYPES = {"milestone", "story_highlight"}


def filter_noise(events: Iterable[ExternalEvent]) -> List[ExternalEvent]:
    filtered: List[ExternalEvent] = []
    for event in events:
        if event.type in ALWAYS_ALLOW_TYPES:
            filtered.append(event)
            continue

        if event.text and event.text.strip():
            filtered.append(event)
    return filtered
