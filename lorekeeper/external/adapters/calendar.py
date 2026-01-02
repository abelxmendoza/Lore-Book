"""Calendar adapter for the External Hub."""

from typing import Dict, Iterable, List

from ..schemas import ExternalEvent


def normalize_calendar(payload: Dict) -> List[ExternalEvent]:
    events: Iterable[Dict] = payload.get("events", [])
    normalized: List[ExternalEvent] = []
    for event in events:
        normalized.append(
            ExternalEvent(
                source="calendar",
                timestamp=event.get("start", ""),
                type="event",
                text=event.get("description") or event.get("title"),
                tags=["meeting"],
                characters=list(event.get("attendees") or []),
            )
        )
    return normalized
