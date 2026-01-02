"""Distillation helpers for Instagram media objects."""
from __future__ import annotations

from datetime import datetime
from typing import List, Sequence


class InstagramDistiller:
    def distill(self, raw_media: Sequence[dict]) -> List[dict]:
        distilled: List[dict] = []
        for media in raw_media:
            distilled.append(self._distill_media(media))
        return distilled

    def _distill_media(self, media: dict) -> dict:
        caption = media.get("caption") or "Instagram memory"
        timestamp = media.get("timestamp") or datetime.utcnow().isoformat()
        tags = {"social", "instagram"}
        media_type = media.get("media_type") or "post"
        location = media.get("location") or media.get("place")
        if media_type:
            tags.add(media_type.lower())

        summary = f"{caption} ({media_type})"
        return {
            "summary": summary,
            "timestamp": timestamp,
            "characters": media.get("tagged_users") or media.get("people") or [],
            "location": location,
            "tags": sorted(tags),
        }


__all__ = ["InstagramDistiller"]
