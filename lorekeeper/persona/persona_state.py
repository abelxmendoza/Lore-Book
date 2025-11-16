from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List


@dataclass
class PersonaState:
    version: str
    driving_motifs: List[str]
    emotional_vector: Dict
    behavioral_slopes: Dict
    tone_profile: Dict
    last_updated: datetime = field(default_factory=datetime.utcnow)

    def as_dict(self) -> Dict:
        return {
            "version": self.version,
            "driving_motifs": list(self.driving_motifs),
            "emotional_vector": dict(self.emotional_vector),
            "behavioral_slopes": dict(self.behavioral_slopes),
            "tone_profile": dict(self.tone_profile),
            "last_updated": self.last_updated.isoformat(),
        }
