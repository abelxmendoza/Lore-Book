"""Sample data helpers for empty accounts."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from lorekeeper.event_schema import TimelineEvent


_DEF_TAGS = ["sample", "onboarding", "seed"]


def _add_event(timeline_manager, **kwargs) -> TimelineEvent:
    event = TimelineEvent(**kwargs)
    return timeline_manager.add_event(event)


def generate_sample_journal_entries(timeline_manager, user_name: str = "Archivist") -> List[TimelineEvent]:
    today = datetime.utcnow().date()
    entries = [
        {
            "date": (today - timedelta(days=2)).isoformat(),
            "title": "A small win",
            "type": "journal",
            "details": f"{user_name} captured a small victory to keep momentum.",
            "tags": _DEF_TAGS + ["gratitude"],
            "source": "system",
        },
        {
            "date": (today - timedelta(days=1)).isoformat(),
            "title": "Met a new ally",
            "type": "journal",
            "details": "Documented a meaningful conversation that could spark a new arc.",
            "tags": _DEF_TAGS + ["relationships"],
            "source": "system",
        },
        {
            "date": today.isoformat(),
            "title": "Set the first quest",
            "type": "journal",
            "details": "Outlined an achievable goal for the week.",
            "tags": _DEF_TAGS + ["goals"],
            "source": "system",
        },
    ]

    stored = []
    for payload in entries:
        stored.append(_add_event(timeline_manager, **payload))
    return stored


def generate_sample_tasks(timeline_manager) -> List[TimelineEvent]:
    today = datetime.utcnow().date()
    tasks = [
        {
            "date": today.isoformat(),
            "title": "Draft weekly briefing",
            "type": "task",
            "details": "Capture highlights, blockers, and next steps.",
            "tags": _DEF_TAGS + ["task"],
            "source": "system",
        },
        {
            "date": (today + timedelta(days=1)).isoformat(),
            "title": "Tag key relationships",
            "type": "task",
            "details": "Assign relationship tags to three entries.",
            "tags": _DEF_TAGS + ["task", "relationships"],
            "source": "system",
        },
    ]

    stored = []
    for payload in tasks:
        stored.append(_add_event(timeline_manager, **payload))
    return stored


def generate_sample_characters(timeline_manager) -> List[TimelineEvent]:
    today = datetime.utcnow().date().isoformat()
    people = [
        {
            "date": today,
            "title": "Character: Mentor",
            "type": "character",
            "details": "A mentor who nudges you toward better decisions.",
            "tags": _DEF_TAGS + ["relationships", "character"],
            "source": "system",
        },
        {
            "date": today,
            "title": "Character: Rival",
            "type": "character",
            "details": "A healthy rival that keeps you sharp.",
            "tags": _DEF_TAGS + ["relationships", "character"],
            "source": "system",
        },
    ]

    stored = []
    for payload in people:
        stored.append(_add_event(timeline_manager, **payload))
    return stored
