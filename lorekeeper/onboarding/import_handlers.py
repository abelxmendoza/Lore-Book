"""Import helpers for onboarding data."""
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List

from lorekeeper.event_schema import TimelineEvent


def _timestamp_now() -> str:
    return datetime.utcnow().isoformat()


def _sanitize_lines(lines: Iterable[str]) -> List[str]:
    cleaned: List[str] = []
    for line in lines:
        text = line.strip()
        if text:
            cleaned.append(text)
    return cleaned


def import_text_dump(timeline_manager, dump_text: str, default_tags: Iterable[str] | None = None):
    tags = set(default_tags or []) | {"imported", "onboarding"}
    entries: list[TimelineEvent] = []
    for chunk in dump_text.split("\n\n"):
        cleaned = " ".join(_sanitize_lines(chunk.splitlines()))
        if not cleaned:
            continue
        event = TimelineEvent(
            date=_timestamp_now(),
            title="Imported note",
            type="import_text",
            details=cleaned,
            tags=sorted(tags),
            source="import_wizard",
        )
        entries.append(timeline_manager.add_event(event))
    return entries


def import_markdown_files(timeline_manager, files: dict[str, str], chapter: str | None = None):
    tags = {"imported", "markdown", "onboarding"}
    entries: list[TimelineEvent] = []
    for name, content in files.items():
        cleaned = " ".join(_sanitize_lines(content.splitlines()))
        if not cleaned:
            continue
        event = TimelineEvent(
            date=_timestamp_now(),
            title=f"Imported markdown: {name}",
            type="import_markdown",
            details=cleaned,
            tags=sorted(tags),
            source="import_wizard",
            metadata={"chapter": chapter or "Imported"},
        )
        entries.append(timeline_manager.add_event(event))
    return entries


def import_json_export(timeline_manager, records: list[dict]):
    tags = {"imported", "json", "onboarding"}
    entries: list[TimelineEvent] = []
    for record in records:
        details = record.get("content") or record.get("text") or "Imported record"
        date = record.get("date") or _timestamp_now()
        event = TimelineEvent(
            date=date,
            title=record.get("title") or "Imported JSON record",
            type="import_json",
            details=str(details),
            tags=sorted(tags | set(record.get("tags") or [])),
            source="import_wizard",
            metadata={"chapter": record.get("chapter"), "raw": record},
        )
        entries.append(timeline_manager.add_event(event))
    return entries


def import_calendar(timeline_manager, events: list[dict]):
    tags = {"imported", "calendar", "onboarding"}
    ingested: list[TimelineEvent] = []
    for item in events:
        event = TimelineEvent(
            date=item.get("start") or _timestamp_now(),
            title=item.get("title") or "Calendar entry",
            type="calendar",
            details=item.get("description") or "Imported from calendar",
            tags=sorted(tags | set(item.get("tags") or [])),
            source="calendar_sync",
            metadata={"location": item.get("location")},
        )
        ingested.append(timeline_manager.add_event(event))
    return ingested


def import_photo_metadata(timeline_manager, photos: list[dict]):
    tags = {"imported", "photos", "onboarding"}
    captured: list[TimelineEvent] = []
    for photo in photos:
        event = TimelineEvent(
            date=photo.get("taken_at") or _timestamp_now(),
            title=photo.get("title") or "Photo moment",
            type="photo_metadata",
            details=photo.get("description") or "Imported photo metadata",
            tags=sorted(tags | set(photo.get("tags") or [])),
            source="photo_sync",
            metadata={
                "camera": photo.get("camera"),
                "location": photo.get("location"),
            },
        )
        captured.append(timeline_manager.add_event(event))
    return captured
