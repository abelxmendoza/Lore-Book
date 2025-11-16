"""Interface layer for agents interacting with the LoreKeeper timeline."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .event_schema import TimelineEvent
from .timeline_manager import TimelineManager


class TimelineAgentInterface:
    """Provides helper methods for agent-driven timeline operations."""

    def __init__(self, base_path: Path | None = None, max_context_events: int = 20) -> None:
        self.manager = TimelineManager(base_path=base_path)
        self.max_context_events = max_context_events

    def load_timeline_context(self) -> List[dict]:
        """Load a limited set of recent, non-archived events for prompt injection."""

        events = self.manager.get_events(include_archived=False)
        sorted_events = sorted(events, key=lambda e: e.date, reverse=True)
        trimmed = sorted_events[: self.max_context_events]
        return [asdict(event) for event in trimmed]

    def add_event_from_text(
        self,
        text: str,
        date: Optional[str] = None,
        title: Optional[str] = None,
        event_type: str = "note",
        tags: Optional[List[str]] = None,
        source: str = "user_entry",
    ) -> TimelineEvent:
        """Create and store a new event derived from user text."""

        resolved_date = date or datetime.utcnow().date().isoformat()
        resolved_title = title or text.split(". ")[0][:80]
        event = TimelineEvent(
            date=resolved_date,
            title=resolved_title,
            type=event_type,
            details=text,
            tags=tags or [],
            source=source,
            archived=False,
        )
        return self.manager.add_event(event)

    def correct_event_from_text(self, event_id: str, text: str, **kwargs) -> Optional[TimelineEvent]:
        """Archive an incorrect event and store a corrected replacement derived from text."""

        date = kwargs.get("date") or datetime.utcnow().date().isoformat()
        event_type = kwargs.get("event_type", "correction")
        tags = kwargs.get("tags") or []
        title = kwargs.get("title") or text.split(". ")[0][:80]
        replacement = TimelineEvent(
            date=date,
            title=title,
            type=event_type,
            details=text,
            tags=tags,
            source="correction",
            archived=False,
        )
        return self.manager.correct_event(event_id, replacement)

    def verify_facts(self, query: str, tags: Optional[List[str]] = None) -> List[TimelineEvent]:
        """Return authoritative events matching a query to reduce ambiguity."""

        tags = tags or []
        candidates = self.manager.get_events(tags=tags, include_archived=True)
        lower_query = query.lower()
        matches = [event for event in candidates if lower_query in event.details.lower() or lower_query in event.title.lower()]
        return matches
