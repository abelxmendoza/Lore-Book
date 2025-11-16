"""Lightweight benchmarking harness for LoreKeeper DSAs."""
from __future__ import annotations

import time
from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import List

from lorekeeper.event_schema import TimelineEvent
from lorekeeper.timeline_manager import TimelineManager
from lorekeeper.indexing import BPlusTree, SkipList, TagDictionary


def _generate_events(count: int) -> List[TimelineEvent]:
    base = date.today()
    events: List[TimelineEvent] = []
    for i in range(count):
        day = base - timedelta(days=i)
        events.append(
            TimelineEvent(
                date=day.isoformat(),
                title=f"Event {i}",
                type="benchmark",
                details="synthetic",
                tags=["benchmark", f"day_{day.day}"],
            )
        )
    return events


def bench_range_queries(events: List[TimelineEvent]) -> float:
    tree = BPlusTree[str, TimelineEvent]()
    for event in events:
        tree.insert(event.date, event)
    start = time.perf_counter()
    tree.range_query(events[-1].date, events[0].date)
    return time.perf_counter() - start


def bench_skiplist(events: List[TimelineEvent]) -> float:
    skip = SkipList[str, TimelineEvent]()
    for event in events:
        skip.insert(event.date, event)
    start = time.perf_counter()
    recent = date.today() - timedelta(days=7)
    skip.range_query(recent.isoformat(), date.today().isoformat())
    return time.perf_counter() - start


def bench_tag_lookup(events: List[TimelineEvent]) -> float:
    tags = TagDictionary()
    for event in events:
        tags.add(event.id, event.tags)
    start = time.perf_counter()
    tags.get("benchmark")
    tags.related_tags(["benchmark"], limit=5)
    return time.perf_counter() - start


def bench_priority_pipeline(events: List[TimelineEvent]) -> float:
    with TemporaryDirectory() as tmp_dir:
        manager = TimelineManager(base_path=Path(tmp_dir))
        for event in events:
            manager.add_event(event)
        start = time.perf_counter()
        manager.get_events(start_date=events[-1].date, end_date=events[0].date)
        return time.perf_counter() - start


def main() -> None:
    events = _generate_events(500)
    results = {
        "range_queries": bench_range_queries(events),
        "skiplist_recency": bench_skiplist(events),
        "tag_lookups": bench_tag_lookup(events),
        "timeline_range": bench_priority_pipeline(events),
    }
    for name, duration in results.items():
        print(f"{name}: {duration * 1000:.3f}ms")


if __name__ == "__main__":
    main()
