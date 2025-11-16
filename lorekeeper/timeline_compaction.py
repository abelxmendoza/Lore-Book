"""Utilities for compacting append-only timeline shards into compact files."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from .timeline_manager import TimelineManager


def compact_year(manager: TimelineManager, year: int) -> Path:
    """Merge a year's append-only log into a compact, chronologically sorted shard."""

    events = manager.load_year(year)
    ordered = sorted(events, key=lambda e: (e.date, e.id))
    compact_path = manager.base_path / f"{year}.compact.json"
    compact_path.write_text(
        json.dumps([event.__dict__ for event in ordered], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return compact_path


def compact_outdated_shards(manager: TimelineManager, horizon_days: int = 180) -> list[Path]:
    """Compact shards older than the provided horizon (default 6 months)."""

    threshold = datetime.utcnow().date() - timedelta(days=horizon_days)
    targets: list[Path] = []
    for path in manager.base_path.glob("*.json"):
        try:
            year = int(path.name.split(".")[0])
        except ValueError:
            continue
        if threshold.year > year:
            targets.append(compact_year(manager, year))
    return targets


__all__ = ["compact_year", "compact_outdated_shards"]
