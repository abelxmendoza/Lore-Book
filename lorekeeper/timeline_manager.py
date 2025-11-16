"""Manager for sharded LoreKeeper timeline event storage.

This module now keeps in-memory secondary indexes to provide near O(1)
lookups by date, tag, type, and character involvement. Events are loaded in
sorted order using bisect-based insertions so range queries operate in O(log n)
time, and cached period windows avoid repeated scans. Disk writes remain
append-only per year shard, with a companion compaction helper to merge shards
for long-lived datasets.
"""
from __future__ import annotations

import json
import hashlib
from bisect import bisect_left, bisect_right
from dataclasses import asdict
from datetime import datetime, timedelta, date
from functools import lru_cache
from pathlib import Path
from typing import DefaultDict, Iterable, List, Optional

from .event_schema import TimelineEvent


class TimelineManager:
    """Provides append-only, year-sharded timeline storage utilities."""

    def __init__(self, base_path: Path | None = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parent / "timeline"
        self.base_path.mkdir(parents=True, exist_ok=True)

        # Primary storage and indexes
        self.events_by_id: dict[str, TimelineEvent] = {}
        self.sorted_event_ids: List[str] = []
        self.sorted_dates: List[str] = []
        self.year_index: DefaultDict[int, List[str]] = DefaultDict(list)
        self.year_dates: DefaultDict[int, List[str]] = DefaultDict(list)

        # Secondary lookups
        self.index_by_date: DefaultDict[str, List[str]] = DefaultDict(list)
        self.index_by_tag: DefaultDict[str, List[str]] = DefaultDict(list)
        self.index_by_type: DefaultDict[str, List[str]] = DefaultDict(list)
        self.index_by_character: DefaultDict[str, List[str]] = DefaultDict(list)
        self.index_by_hash: dict[str, str] = {}

        # Caching for rolling windows
        self._period_cache: dict[tuple[str, str], List[str]] = {}

        self._bootstrap_from_disk()

    def _year_file(self, year: int) -> Path:
        return self.base_path / f"{year}.json"

    def _compact_file(self, year: int) -> Path:
        return self.base_path / f"{year}.compact.json"

    def _load_raw_year(self, year: int) -> List[dict]:
        """Load a specific year's shard, preferring compacted data when present."""

        compact_path = self._compact_file(year)
        path = compact_path if compact_path.exists() else self._year_file(year)
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _save_year(self, year: int, events: Iterable[dict]) -> None:
        path = self._year_file(year)
        path.write_text(json.dumps(list(events), indent=2, ensure_ascii=False), encoding="utf-8")

    def _bootstrap_from_disk(self) -> None:
        """Load all shards and build in-memory indexes for near O(1) retrieval."""

        year_candidates: set[int] = set()
        for path in self.base_path.glob("*.json"):
            name = path.name
            try:
                year = int(name.split(".")[0])
            except ValueError:
                continue
            year_candidates.add(year)

        for year in sorted(year_candidates):
            for event in self.load_year(year):
                self._index_event(event)

    def _compute_ingestion_hash(self, event: TimelineEvent) -> str:
        payload = f"{event.date}|{event.title}|{event.type}|{event.details}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _insert_sorted_event(self, event: TimelineEvent) -> None:
        position = bisect_right(self.sorted_dates, event.date)
        self.sorted_dates.insert(position, event.date)
        self.sorted_event_ids.insert(position, event.id)
        # maintain year-specific sorted order
        event_year = datetime.fromisoformat(event.date).year
        year_dates = self.year_dates[event_year]
        year_ids = self.year_index[event_year]
        year_pos = bisect_right(year_dates, event.date)
        year_dates.insert(year_pos, event.date)
        year_ids.insert(year_pos, event.id)

    def _index_event(self, event: TimelineEvent) -> None:
        if event.id in self.events_by_id:
            return

        self.events_by_id[event.id] = event
        self._insert_sorted_event(event)

        self.index_by_date[event.date].append(event.id)
        if event.type:
            self.index_by_type[event.type].append(event.id)
        for tag in event.tags:
            self.index_by_tag[tag.lower()].append(event.id)
        if isinstance(event.metadata, dict):
            characters = event.metadata.get("characters") or []
            for character_id in characters:
                self.index_by_character[str(character_id)].append(event.id)
        ingestion_hash = self._compute_ingestion_hash(event)
        self.index_by_hash.setdefault(ingestion_hash, event.id)

    def _invalidate_cache(self) -> None:
        self._period_cache.clear()
        self._get_events_for_period.cache_clear()

    def load_year(self, year: int) -> List[TimelineEvent]:
        """Load all events for a given year, initializing the file if needed."""

        raw_events = self._load_raw_year(year)
        return [TimelineEvent(**item) for item in raw_events]

    def add_event(self, event: TimelineEvent) -> TimelineEvent:
        """Append a new immutable event into its year shard without modifying existing data."""

        ingestion_hash = self._compute_ingestion_hash(event)
        existing_id = self.index_by_hash.get(ingestion_hash)
        if existing_id:
            return self.events_by_id[existing_id]

        event_year = datetime.fromisoformat(event.date).year
        events = self._load_raw_year(event_year)
        events.append(asdict(event))
        self._save_year(event_year, events)

        self._index_event(event)
        self._invalidate_cache()
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

        tags = [tag.lower() for tag in (tags or [])]
        candidates: List[TimelineEvent] = []

        if start_date or end_date:
            start = start_date or "0000-01-01"
            end = end_date or "9999-12-31"
            candidates.extend(self.get_events_between(start, end))
        elif year is not None:
            candidates.extend([self.events_by_id[eid] for eid in self.year_index.get(year, [])])
        else:
            candidates.extend([self.events_by_id[eid] for eid in self.sorted_event_ids])

        if tags:
            tag_sets = [set(self.index_by_tag.get(tag, [])) for tag in tags]
            allowed_ids = set.union(*tag_sets) if tag_sets else set()
        else:
            allowed_ids = None

        def in_range(event: TimelineEvent) -> bool:
            if not include_archived and event.archived:
                return False
            if allowed_ids is not None and event.id not in allowed_ids:
                return False
            if start_date and event.date < start_date:
                return False
            if end_date and event.date > end_date:
                return False
            return True

        return [event for event in candidates if in_range(event)]

    def get_events_between(self, start: str, end: str) -> List[TimelineEvent]:
        """Return events within an inclusive ISO date range using bisect lookups."""

        start_idx = bisect_left(self.sorted_dates, start)
        end_idx = bisect_right(self.sorted_dates, end)
        return [self.events_by_id[eid] for eid in self.sorted_event_ids[start_idx:end_idx]]

    @lru_cache(maxsize=1024)
    def _get_events_for_period(self, start: str, end: str, include_archived: bool) -> tuple[str, ...]:
        events = self.get_events_between(start, end)
        if include_archived:
            return tuple(event.id for event in events)
        return tuple(event.id for event in events if not event.archived)

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

        reference = reference_date or datetime.utcnow().date()
        cache_key = (period, reference.isoformat(), include_archived)
        cached_ids = self._period_cache.get(cache_key)
        if cached_ids is not None and not tags:
            return [self.events_by_id[eid] for eid in cached_ids]

        start_date, end_date = self._resolve_period_range(period, reference_date=reference)
        if not tags:
            cached_ids = self._get_events_for_period(start_date, end_date, include_archived)
            events = [self.events_by_id[eid] for eid in cached_ids]
            self._period_cache[cache_key] = list(cached_ids)
        else:
            events = self.get_events(start_date=start_date, end_date=end_date, tags=tags, include_archived=include_archived)
        return events

    def archive_event(self, event_id: str) -> Optional[TimelineEvent]:
        """Mark an event as archived while keeping it in the shard."""

        for path in self.base_path.glob("*.json"):
            try:
                year = int(path.name.split(".")[0])
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
                # refresh the in-memory representation
                self.events_by_id[event_id] = archived_event
                self._invalidate_cache()
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
