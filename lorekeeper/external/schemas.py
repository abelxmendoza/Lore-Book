from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ExternalEvent:
    source: str
    timestamp: str
    type: str
    text: Optional[str] = None
    image_url: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    characters: List[str] = field(default_factory=list)
    milestone: Optional[str] = None


@dataclass
class ExternalSummary(ExternalEvent):
    summary: str = ""
