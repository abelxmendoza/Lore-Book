"""Manager for sharded LoreKeeper timeline event storage."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

from .event_schema import TimelineEvent


class TimelineManager:
    """Provides append-only, year-sharded timeline storage utilities."""

    def __init__(self, base_path: Path | None = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parent / "timeline"
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _year_file(self, year: int) -> Path:
        return self.base_path / f"{year}.json"

    def _load_raw_year(self, year: int) -> List[dict]:
        path = self._year_file(year)
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _save_year(self, year: int, events: Iterable[dict]) -> None:
        path = self._year_file(year)
        path.write_text(json.dumps(list(events), indent=2, ensure_ascii=False), encoding="utf-8")

    def load_year(self, year: int) -> List[TimelineEvent]:
        """Load all events for a given year, initializing the file if needed."""

        raw_events = self._load_raw_year(year)
        return [TimelineEvent(**item) for item in raw_events]

    def add_event(self, event: TimelineEvent) -> TimelineEvent:
        """Append a new immutable event into its year shard without modifying existing data."""

        event_year = datetime.fromisoformat(event.date).year
        events = self._load_raw_year(event_year)
        events.append(asdict(event))
        self._save_year(event_year, events)
        return event

    def get_events(
        self,
        year: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        tags: Optional[List[str]] = None,
        include_archived: bool = False,
    ) -> List[TimelineEvent]:
        """Retrieve events filtered by year, date range, and tags."""

        tags = tags or []
        candidates: List[TimelineEvent] = []
        if year is not None:
            candidates.extend(self.load_year(year))
        else:
            for path in sorted(self.base_path.glob("*.json")):
                try:
                    year_number = int(path.stem)
                except ValueError:
                    continue
                candidates.extend(self.load_year(year_number))

        def in_range(event: TimelineEvent) -> bool:
            if not include_archived and event.archived:
                return False
            if tags and not set(tags).intersection(event.tags):
                return False
            if start_date and event.date < start_date:
                return False
            if end_date and event.date > end_date:
                return False
            return True

        return [event for event in candidates if in_range(event)]

    def archive_event(self, event_id: str) -> Optional[TimelineEvent]:
        """Mark an event as archived while keeping it in the shard."""

        for path in self.base_path.glob("*.json"):
            try:
                year = int(path.stem)
            except ValueError:
                continue
            events = self._load_raw_year(year)
            updated = []
            archived_event: Optional[TimelineEvent] = None
            for item in events:
                if item["id"] == event_id:
                    if not item.get("archived", False):
                        item["archived"] = True
                    archived_event = TimelineEvent(**item)
                updated.append(item)
            if archived_event:
                self._save_year(year, updated)
                return archived_event
        return None

    def correct_event(self, event_id: str, corrected_event: TimelineEvent) -> Optional[TimelineEvent]:
        """Archive the original event and append a corrected replacement."""

        original = self.archive_event(event_id)
        if original is None:
            return None
        corrected = corrected_event
        if not corrected.source:
            corrected = TimelineEvent(
                id=corrected_event.id,
                date=corrected_event.date,
                title=corrected_event.title,
                type=corrected_event.type,
                details=corrected_event.details,
                tags=corrected_event.tags,
                source="correction",
                archived=corrected_event.archived,
            )
        self.add_event(corrected)
        return corrected
