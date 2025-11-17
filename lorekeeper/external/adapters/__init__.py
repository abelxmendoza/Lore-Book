"""Adapters for normalizing external sources."""

from .github import normalize_github
from .instagram import normalize_instagram
from .x import normalize_x
from .calendar import normalize_calendar
from .photos import normalize_photos

__all__ = [
    "normalize_github",
    "normalize_instagram",
    "normalize_x",
    "normalize_calendar",
    "normalize_photos",
]
