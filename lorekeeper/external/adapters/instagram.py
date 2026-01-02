"""Instagram adapter for the External Hub."""

from typing import Dict, List

from ..schemas import ExternalEvent


def _extract_tags(caption: str | None) -> List[str]:
    if not caption:
        return []
    return [tag[1:] for tag in caption.split() if tag.startswith('#') and len(tag) > 1]


def normalize_instagram(response: Dict) -> List[ExternalEvent]:
    items = response.get("items", [])
    normalized: List[ExternalEvent] = []
    for item in items:
        normalized.append(
            ExternalEvent(
                source="instagram",
                timestamp=item.get("timestamp", ""),
                type=item.get("media_type", ""),
                text=item.get("caption"),
                image_url=item.get("media_url"),
                tags=_extract_tags(item.get("caption")),
            )
        )
    return normalized
