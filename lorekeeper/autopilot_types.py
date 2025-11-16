"""Structured output types for the AutopilotEngine."""
from dataclasses import dataclass, field
from typing import List, Any


@dataclass
class DailyRecommendation:
    """Actionable daily recommendation payload."""

    description: str
    confidence: float
    evidence: List[Any] = field(default_factory=list)
    suggested_tasks: List[Any] = field(default_factory=list)
    urgency: str = "normal"


@dataclass
class WeeklyStrategy:
    """Weekly focus strategy."""

    description: str
    confidence: float
    evidence: List[Any] = field(default_factory=list)
    focus_areas: List[str] = field(default_factory=list)


@dataclass
class MonthlyCorrection:
    """Monthly course correction guidance."""

    description: str
    confidence: float
    evidence: List[Any] = field(default_factory=list)
    adjustments: List[str] = field(default_factory=list)


@dataclass
class TransitionGuidance:
    """Arc transition notes when identity shifts occur."""

    description: str
    evidence: List[Any] = field(default_factory=list)
    identity_shift_detected: bool = False
    recommended_behavior: List[str] = field(default_factory=list)


@dataclass
class RiskAlert:
    """Risk alert for burnout or slump cycles."""

    alert_type: str
    confidence: float
    evidence: List[Any] = field(default_factory=list)
    risk_level: int = 1  # 1–5


@dataclass
class MomentumSignal:
    """Positive signal that momentum is building in a skill area."""

    description: str
    evidence: List[Any] = field(default_factory=list)
    skill_area: str = "general"
    momentum_score: float = 0.0
