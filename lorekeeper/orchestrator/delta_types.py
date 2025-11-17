from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict


@dataclass
class OrchestratorDelta:
    type: str
    timestamp: datetime
    user_id: str
    payload: Dict[str, Any]
