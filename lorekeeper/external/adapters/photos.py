"""Photos adapter for EXIF and captions."""

from typing import Dict, Iterable, List

from ..schemas import ExternalEvent


def normalize_photos(payload: Dict) -> List[ExternalEvent]:
    photos: Iterable[Dict] = payload.get("photos", [])
    normalized: List[ExternalEvent] = []
    for photo in photos:
        normalized.append(
            ExternalEvent(
                source="photos",
                timestamp=photo.get("captured_at", ""),
                type="photo",
                text=photo.get("caption") or photo.get("location") or "Photo captured",
                tags=["photo", photo.get("location")] if photo.get("location") else ["photo"],
                characters=list(photo.get("people") or []),
                image_url=photo.get("url"),
            )
        )
    return normalized
