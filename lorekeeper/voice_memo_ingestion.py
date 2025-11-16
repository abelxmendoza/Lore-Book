"""Voice memo ingestion utilities for LoreKeeper."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from .event_schema import TimelineEvent
from .timeline_manager import TimelineManager


@dataclass
class VoiceMemo:
    """Simple representation of an ingested voice memo."""

    transcription: str
    recorded_at: datetime
    device: str = "unknown_device"
    tags: Optional[List[str]] = None
    source_uri: Optional[Path] = None


class VoiceMemoIngestor:
    """Convert voice memos into structured timeline events."""

    def __init__(self, manager: TimelineManager) -> None:
        self.manager = manager

    def ingest_transcription(self, memo: VoiceMemo) -> TimelineEvent:
        title = memo.transcription.split(". ")[0][:80]
        tags = memo.tags or []
        metadata = {
            "ingestion": "voice_memo",
            "device": memo.device,
            "source_uri": str(memo.source_uri) if memo.source_uri else None,
        }
        event = TimelineEvent(
            date=memo.recorded_at.date().isoformat(),
            title=title,
            type="voice_memo",
            details=memo.transcription,
            tags=tags,
            source="voice_memo",
            metadata=metadata,
        )
        return self.manager.add_event(event)

    def ingest_audio_file(self, path: Path, transcription: str, recorded_at: Optional[datetime] = None, tags: Optional[List[str]] = None) -> TimelineEvent:
        recorded_time = recorded_at or datetime.utcnow()
        memo = VoiceMemo(transcription=transcription, recorded_at=recorded_time, device=path.name, tags=tags, source_uri=path)
        return self.ingest_transcription(memo)
