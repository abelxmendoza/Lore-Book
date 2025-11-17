"""Adapter for X posts."""

from typing import Dict, List

from ..schemas import ExternalEvent


def normalize_x(response: Dict) -> List[ExternalEvent]:
    posts = response.get("posts", [])
    normalized: List[ExternalEvent] = []
    for post in posts:
        normalized.append(
            ExternalEvent(
                source="x",
                timestamp=post.get("created_at", ""),
                type="post",
                text=post.get("text"),
                image_url=(post.get("media_urls") or [None])[0],
                tags=["media"] if post.get("media_urls") else [],
            )
        )
    return normalized
