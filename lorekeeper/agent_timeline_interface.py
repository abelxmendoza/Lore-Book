# © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
"""Interface layer for agents interacting with the LoreKeeper timeline."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import re

from .event_schema import TimelineEvent
from .timeline_manager import TimelineManager


class TimelineAgentInterface:
    """Provides helper methods for agent-driven timeline operations."""

    def __init__(
        self, base_path: Path | None = None, max_context_events: int = 20, user_id: str | None = None
    ) -> None:
        self.manager = TimelineManager(base_path=base_path, user_id=user_id)
        self,
        base_path: Path | None = None,
        max_context_events: int = 20,
        user_id: str | None = None,
    ) -> None:
        safe_user = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id or "shared")
        scoped_base = (base_path or Path(__file__).resolve().parent / "timeline") / safe_user
        self.manager = TimelineManager(base_path=scoped_base)
        self.max_context_events = max_context_events
        self.user_id = user_id

    def _filter_private(self, events: List[TimelineEvent]) -> List[TimelineEvent]:
        filtered: List[TimelineEvent] = []
        for event in events:
            metadata = getattr(event, "metadata", {}) or {}
            if metadata.get("visibility") == "private" or metadata.get("encrypted"):
                # Do not expose private or encrypted entries unless decrypted upstream
                continue
            filtered.append(event)
        return filtered

    def load_timeline_context(self, request_user_id: str | None = None) -> List[dict]:
        """Load a limited set of recent, non-archived events for prompt injection."""

        if request_user_id is not None:
            assert request_user_id == self.manager.user_id
        events = self.manager.get_events(include_archived=False)
        sorted_events = sorted(events, key=lambda e: e.date, reverse=True)
    def load_timeline_context(
        self,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> List[dict]:
        """Load a limited set of recent, non-archived events for prompt injection."""

        events = self.manager.get_events(
            include_archived=False,
            start_date=start_date,
            end_date=end_date,
            tags=tags,
        )
        scoped = self._filter_private(events)
        sorted_events = sorted(scoped, key=lambda e: e.date, reverse=True)
        trimmed = sorted_events[: self.max_context_events]
        return [asdict(event) for event in trimmed]

    def query_context_window(
        self, period: str, tags: Optional[List[str]] = None, request_user_id: str | None = None
    ) -> List[dict]:
        """Convenience helper to fetch events for common context windows."""

        if request_user_id is not None:
            assert request_user_id == self.manager.user_id
        events = self.manager.get_events_by_period(period, tags=tags, include_archived=False)
        scoped = self._filter_private(events)
        sorted_events = sorted(scoped, key=lambda e: e.date, reverse=True)
        return [asdict(event) for event in sorted_events[: self.max_context_events]]

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
        candidates = self._filter_private(
            self.manager.get_events(tags=tags, include_archived=True)
        )
        lower_query = query.lower()
        matches = [event for event in candidates if lower_query in event.details.lower() or lower_query in event.title.lower()]
        return matches
