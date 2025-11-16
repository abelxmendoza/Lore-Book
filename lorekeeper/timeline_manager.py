"""Manager for sharded LoreKeeper timeline event storage."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Iterable, List, Optional, Dict

from .event_schema import TimelineEvent
from .indexing import BPlusTree, SkipList, TagDictionary, SemanticCache


class TimelineManager:
    """Provides append-only, year-sharded timeline storage utilities."""

    def __init__(self, base_path: Path | None = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parent / "timeline"
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.date_index: BPlusTree[str, TimelineEvent] = BPlusTree()
        self.recency_index: SkipList[str, TimelineEvent] = SkipList()
        self.tag_index = TagDictionary()
        self.semantic_cache = SemanticCache(capacity=200)
        self._events_by_id: Dict[str, TimelineEvent] = {}
        self._refresh_indexes()

    def _year_file(self, year: int) -> Path:
        return self.base_path / f"{year}.json"

    def _load_raw_year(self, year: int) -> List[dict]:
        path = self._year_file(year)
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _index_event(self, event: TimelineEvent) -> None:
        if event.id in self._events_by_id:
            return
        self._events_by_id[event.id] = event
        self.date_index.insert(event.date, event)
        self.recency_index.insert(event.date, event)
        self.tag_index.add(event.id, event.tags)

    def _refresh_indexes(self) -> None:
        self.date_index = BPlusTree()
        self.recency_index = SkipList()
        self.tag_index = TagDictionary()
        self._events_by_id = {}

        for path in sorted(self.base_path.glob("*.json")):
            try:
                year_number = int(path.stem)
            except ValueError:
                continue
            for item in self._load_raw_year(year_number):
                event = TimelineEvent(**item)
                self._index_event(event)

    def _save_year(self, year: int, events: Iterable[dict]) -> None:
        path = self._year_file(year)
        path.write_text(json.dumps(list(events), indent=2, ensure_ascii=False), encoding="utf-8")

    def load_year(self, year: int) -> List[TimelineEvent]:
        """Load all events for a given year, initializing the file if needed."""

        raw_events = self._load_raw_year(year)
        events: List[TimelineEvent] = []
        for item in raw_events:
            event = TimelineEvent(**item)
            events.append(event)
            self._index_event(event)
        return events

    def add_event(self, event: TimelineEvent) -> TimelineEvent:
        """Append a new immutable event into its year shard without modifying existing data."""

        event_year = datetime.fromisoformat(event.date).year
        events = self._load_raw_year(event_year)
        events.append(asdict(event))
        self._save_year(event_year, events)
        self._index_event(event)
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
        candidates: List[TimelineEvent]
        if tags:
            tag_sets = [self.tag_index.get(tag) for tag in tags]
            if not tag_sets:
                return []
            matching_ids = set.intersection(*tag_sets) if len(tag_sets) > 1 else tag_sets[0]
            candidates = [self._events_by_id[event_id] for event_id in matching_ids if event_id in self._events_by_id]
        elif start_date or end_date:
            candidates = self.date_index.range_query(start=start_date, end=end_date)
        else:
            candidates = list(self._events_by_id.values())

        def in_range(event: TimelineEvent) -> bool:
            if not include_archived and event.archived:
                return False
            if year is not None and not str(getattr(event, "date", "")).startswith(str(year)):
                return False
            if tags and not set(tags).intersection(event.tags):
                return False
            if start_date and event.date < start_date:
                return False
            if end_date and event.date > end_date:
                return False
            return True

        return sorted((event for event in candidates if in_range(event)), key=lambda e: e.date)

    def _resolve_period_range(self, period: str, reference_date: Optional[date] = None) -> tuple[str, str]:
        """Translate a named period into an ISO date range inclusive of the reference date."""

        today = reference_date or datetime.utcnow().date()

        if period == "last_7_days":
            start = today - timedelta(days=6)
        elif period == "last_30_days":
            start = today - timedelta(days=29)
        elif period == "last_3_months":
            start = today - timedelta(days=90)
        elif period == "this_year":
            start = date(year=today.year, month=1, day=1)
        else:
            raise ValueError(f"Unsupported period: {period}")

        return start.isoformat(), today.isoformat()

    def get_events_by_period(
        self,
        period: str,
        tags: Optional[List[str]] = None,
        include_archived: bool = False,
        reference_date: Optional[date] = None,
    ) -> List[TimelineEvent]:
        """Convenience wrapper to fetch events for a named context window."""

        start_date, end_date = self._resolve_period_range(period, reference_date=reference_date)
        return self.get_events(start_date=start_date, end_date=end_date, tags=tags, include_archived=include_archived)

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
                self._refresh_indexes()
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
        self._refresh_indexes()
        return corrected
