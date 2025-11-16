from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class InsightBase:
    confidence: float
    evidence: List[str]
    description: str
    action_suggestion: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "confidence": round(self.confidence, 3),
            "evidence": self.evidence,
            "description": self.description,
            "action_suggestion": self.action_suggestion,
            **({"metadata": self.metadata} if self.metadata else {}),
        }


@dataclass
class PatternInsight(InsightBase):
    pattern: str = ""

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["pattern"] = self.pattern
        return base


@dataclass
class CorrelationInsight(InsightBase):
    variables: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["variables"] = self.variables
        return base


@dataclass
class CyclicBehaviorInsight(InsightBase):
    period: str = ""

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["period"] = self.period
        return base


@dataclass
class IdentityShiftInsight(InsightBase):
    shift: str = ""

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["shift"] = self.shift
        return base


@dataclass
class MotifInsight(InsightBase):
    motif: str = ""

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["motif"] = self.motif
        return base


@dataclass
class PredictionInsight(InsightBase):
    horizon: str = ""

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base["horizon"] = self.horizon
        return base
