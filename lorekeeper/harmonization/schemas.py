from dataclasses import dataclass
from typing import Any, Dict, List

from .harmonizer import SmartHighlight


@dataclass
class HarmonizationResult:
    highlights: List[SmartHighlight]
    clusters: Dict[str, List[Dict[str, Any]]]
    identityHints: List[Any]
    stability: float
