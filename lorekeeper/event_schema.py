"""Schema definitions for LoreKeeper timeline events."""
from dataclasses import dataclass, field
import uuid
from typing import List, Dict, Any


@dataclass(frozen=True)
class TimelineEvent:
    """Immutable, atomic representation of a single timeline entry."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    date: str = ""
    title: str = ""
    type: str = ""
    details: str = ""
    tags: List[str] = field(default_factory=list)
    source: str = ""
    archived: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
